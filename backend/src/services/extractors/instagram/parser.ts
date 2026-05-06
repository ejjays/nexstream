import { load } from 'cheerio';
import { Format } from '../../../types/index.js';

export interface RawExtractedData {
    title: string;
    author: string;
    thumbnail: string | null;
    formats: Format[];
    isRestricted?: boolean;
}

export function parseOembed(odata: any, currentData: RawExtractedData): RawExtractedData {
    const newData = { ...currentData };
    if (odata.title && odata.title !== 'Instagram Video') {
        newData.title = odata.title;
    }
    newData.author = odata.author_name || newData.author;
    newData.thumbnail = odata.thumbnail_url || newData.thumbnail;
    return newData;
}

export function parseGraphql(gqlData: any, currentData: RawExtractedData): RawExtractedData {
    const newData = { ...currentData };
    const media = gqlData?.data?.xdt_shortcode_media;
    if (media) {
        if (media.video_url) {
            newData.formats.push({
                format_id: 'best',
                url: media.video_url,
                ext: 'mp4',
                resolution: 'Source (HD)',
                vcodec: 'yes',
                acodec: 'yes',
                is_muxed: true,
                is_video: true,
                is_audio: true
            });
        }
        // photo second
        if (media.display_url) {
            const hasVideo = newData.formats.some(f => f.is_video);
            newData.formats.push({
                format_id: 'photo',
                url: media.display_url,
                ext: 'jpg',
                resolution: 'Image',
                vcodec: 'none',
                acodec: 'none',
                is_muxed: false,
                is_video: false,
                is_audio: false
            });
        }
        
        if (media.owner?.username) newData.author = media.owner.username;
        if (!newData.thumbnail && media.display_url) newData.thumbnail = media.display_url;
        if (!newData.thumbnail && media.thumbnail_src) newData.thumbnail = media.thumbnail_src;
        
        const caption = media.edge_media_to_caption?.edges?.[0]?.node?.text;
        if (caption && (!newData.title || newData.title === 'Instagram Video')) {
            newData.title = caption;
        }
    }
    return newData;
}

export function parseEmbed(html: string, currentData: RawExtractedData): RawExtractedData {
    const newData = { ...currentData };
    
    if (html.includes('may have been removed') || html.includes("This content isn't available")) {
        newData.isRestricted = true;
        return newData;
    }

    const $ = load(html);
    let jsonData: any = null;
    
    try {
        const jsonMatch = html.match(/window\.__additionalDataLoaded\s*\(.*,\s*({.*})\s*\);/) || 
                        html.match(/window\._sharedData\s*=\s*({.*});/);
        
        if (jsonMatch) {
            jsonData = JSON.parse(jsonMatch[1]);
        } else {
            const scriptBlocks = $('script').toArray();
            for (const script of scriptBlocks) {
                const content = $(script).html();
                if (content && content.includes('video_url')) {
                    const jsonMatches = content.match(/({.*?})/g) || [content.match(/{.*}/)?.[0]];
                    for (const matchStr of jsonMatches) {
                        if (!matchStr) continue;
                        try {
                            const parsed = JSON.parse(matchStr);
                            const media = parsed.shortcode_media || parsed.graphql?.shortcode_media || parsed;
                            
                            let targetMedia = media;
                            if (media.edge_sidecar_to_children?.edges?.length > 0) {
                                const firstVideo = media.edge_sidecar_to_children.edges.find((e: any) => e.node?.is_video || e.node?.video_url);
                                if (firstVideo) targetMedia = firstVideo.node;
                            }

                            if (targetMedia.video_url) {
                                jsonData = parsed;
                                jsonData._extractedMedia = targetMedia;
                                break;
                            }
                        } catch (e: any) { 
                            console.debug('[InstagramExtractor] JSON parse error for node:', e.message); 
                        }
                    }
                    if (jsonData) break;
                }
            }
        }
    } catch (e: unknown) {
        const error = e as Error;
        console.debug(`[JS-IG] JSON Parse Error: ${error.message}`);
    }

    let videoUrl: string | null = null;
    let displayUrl: string | null = null;
    if (jsonData) {
        const media = jsonData._extractedMedia || jsonData.shortcode_media || jsonData.graphql?.shortcode_media || jsonData;
        videoUrl = media.video_url || jsonData.video_url;
        displayUrl = media.display_url || jsonData.display_url;
    }

    if (!videoUrl) {
        const videoMatch = html.match(/"video_url":"([^"]+)"/) || 
                           html.match(/\\"video_url\\":\\"(.*?)\\"/) ||
                           html.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/) ||
                           html.match(/https?:\/\/[^"'\s]+\.fna\.fbcdn\.net\/[^"'\s]+\.mp4[^"'\s]*/);
        
        if (videoMatch) {
            videoUrl = videoMatch[1] || videoMatch[0];
            videoUrl = videoUrl
                .replace(/\u0026/g, '&')
                .replace(/\\u0026/g, '&')
                .replace(/\\/g, '');
        }
    }
    
    if (!displayUrl) {
        const displayMatch = html.match(/"display_url":"([^"]+)"/) || 
                           html.match(/\\"display_url\\":\\"(.*?)\\"/) ||
                           html.match(/"display_src":"([^"]+)"/) ||
                           html.match(/\\"display_src\\":\\"(.*?)\\"/);
        
        if (displayMatch) {
            displayUrl = displayMatch[1]
                .replace(/\u0026/g, '&')
                .replace(/\\u0026/g, '&')
                .replace(/\\/g, '');
        } else {
            // og:image fallback
            const $ = load(html);
            displayUrl = $('meta[property="og:image"]').attr('content') || null;
        }
    }

    if (videoUrl) {
        console.debug(`[JS-IG] Found video_url: ${videoUrl.substring(0, 50)}...`);
        newData.formats.push({
            format_id: 'best',
            url: videoUrl,
            ext: 'mp4',
            resolution: 'Source (HD)',
            vcodec: 'yes',
            acodec: 'yes',
            is_muxed: true,
            is_video: true,
            is_audio: true
        });
    } else if (displayUrl) {
        console.debug(`[JS-IG] Found display_url: ${displayUrl.substring(0, 50)}...`);
        newData.formats.push({
            format_id: 'photo',
            url: displayUrl,
            ext: 'jpg',
            resolution: 'Image',
            vcodec: 'none',
            acodec: 'none',
            is_muxed: false,
            is_video: false,
            is_audio: false
        });
    } else {
        console.debug('[JS-IG] No video_url or display_url found in embed page');
    }

    const embedAuthor = $('.UsernameText').text().trim();
    if (embedAuthor) newData.author = embedAuthor;
    
    let scriptCaption = '';
    if (jsonData) {
        scriptCaption = jsonData.caption || 
                        jsonData.shortcode_media?.edge_media_to_caption?.edges?.[0]?.node?.text ||
                        jsonData.graphql?.shortcode_media?.edge_media_to_caption?.edges?.[0]?.node?.text || '';
    }

    if (!scriptCaption) {
        const captionMatch = html.match(/\"caption\":\"(.*?)\"/) || html.match(/"caption":"([^"]+)"/);
        if (captionMatch) {
            scriptCaption = captionMatch[1]
                .replace(/\\u([0-9a-fA-F]{4})/g, (match: any, grp: string) => String.fromCharCode(parseInt(grp, 16)))
                .replace(/\\n/g, '\n')
                .replace(/\n/g, '\n')
                .replace(/\"/g, '"');
        }
    }

    const possibleTitles = [
        scriptCaption,
        $('.CaptionText').text().trim(),
        $('meta[property="og:title"]').attr('content'),
        $('meta[property="og:description"]').attr('content'),
        $('meta[name="description"]').attr('content'),
        $('link[rel="alternate"][title]').attr('title')
    ].filter((t): t is string => !!(t && t !== 'Instagram Video' && !t.includes('See Instagram photos and videos')));

    if (possibleTitles.length > 0) {
        if (scriptCaption) {
            newData.title = scriptCaption;
        } else if ($('.CaptionText').length > 0) {
            newData.title = $('.CaptionText').text().trim();
        } else {
            newData.title = possibleTitles.reduce((a, b) => a.length > b.length ? a : b);
        }
    }

    if (!newData.thumbnail) {
        newData.thumbnail = jsonData?.display_url || 
                            jsonData?.shortcode_media?.display_url ||
                            $('meta[property="og:image"]').attr('content') || 
                            $('.EmbeddedMediaImage').attr('src') || null;
    }

    return newData;
}
