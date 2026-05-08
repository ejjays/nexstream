import { load } from 'cheerio';
import { Format } from '../../../types/index.js';

export interface RawExtractedData {
    title: string;
    author: string;
    thumbnail: string | null;
    formats: Format[];
    isRestricted?: boolean;
}

export function parseOembed(
    odata: { title?: string; author_name?: string; thumbnail_url?: string },
    currentData: RawExtractedData
): RawExtractedData {
    const newData = { ...currentData };
    if (odata.title && odata.title !== 'Instagram Video') {
        newData.title = odata.title;
    }
    newData.author = odata.author_name || newData.author;
    newData.thumbnail = odata.thumbnail_url || newData.thumbnail;
    return newData;
}

export function parseGraphql(gqlData: unknown, currentData: RawExtractedData): RawExtractedData {
    const newData = { ...currentData };
    if (typeof gqlData !== 'object' || gqlData === null) {
        return newData;
    }
    const data = gqlData as { data?: { xdt_shortcode_media?: {
        video_url?: string;
        display_url?: string;
        thumbnail_src?: string;
        owner?: {
            username?: string;
        };
        edge_media_to_caption?: {
            edges?: Array<{
                node?: {
                    text?: string;
                };
            }>;
        };
    } } };
    const media = data.data?.xdt_shortcode_media;
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
                resolution: hasVideo ? 'Thumbnail' : 'Image',
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
    let jsonData: unknown = null;
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
                    for (const matchStr of jsonMatches as string[]) {
                        if (!matchStr) continue;
                        try {
                            const parsed = JSON.parse(matchStr) as Record<string, unknown>;
                            const media = (parsed.shortcode_media as Record<string, unknown> | undefined) ??
                                          (parsed.graphql as { shortcode_media?: Record<string, unknown> })?.shortcode_media ??
                                          parsed;
                            let targetMedia = media as Record<string, unknown>;
                            if (
                                typeof media === 'object' &&
                                media !== null &&
                                'edge_sidecar_to_children' in media &&
                                Array.isArray((media.edge_sidecar_to_children as { edges?: unknown }).edges) &&
                                (media.edge_sidecar_to_children as { edges: unknown[] }).edges.length > 0
                            ) {
                                const edges = (media.edge_sidecar_to_children as { edges: unknown[] }).edges;
                                const firstVideo = edges.find((e): e is { node: Record<string, unknown> } => {
                                    if (typeof e !== 'object' || e === null) return false;
                                    const edge = e as Record<string, unknown>;
                                    const node = edge.node as Record<string, unknown>;
                                    return Boolean(node.is_video) || Boolean(node.video_url);
                                });
                                if (firstVideo) targetMedia = firstVideo.node;
                            }

                            if ('video_url' in targetMedia) {
                                jsonData = parsed;
                                (jsonData as Record<string, unknown>)._extractedMedia = targetMedia;
                                break;
                            }
                        } catch (e: unknown) { 
                            const err = e as Error;
                            console.debug('[InstagramExtractor] JSON parse error for node:', err.message); 
                        }
                    }
                    if (jsonData) break;
                }
            }
        }
    } catch (e: unknown) {
        const err = e as Error;
        console.debug(`[JS-IG] JSON Parse Error: ${err.message}`);
    }

    let videoUrl: string | null = null;
    let displayUrl: string | null = null;
    if (jsonData) {
        const dataObj = jsonData as Record<string, unknown> & {
            _extractedMedia?: Record<string, unknown>;
            shortcode_media?: Record<string, unknown>;
            graphql?: { shortcode_media?: Record<string, unknown> };
        };
        const mediaObj =
            dataObj._extractedMedia ??
            dataObj.shortcode_media ??
            dataObj.graphql?.shortcode_media ??
            (dataObj as Record<string, unknown>);
        videoUrl =
            typeof mediaObj.video_url === 'string'
                ? mediaObj.video_url
                : typeof dataObj.video_url === 'string'
                ? dataObj.video_url
                : null;
        displayUrl =
            typeof mediaObj.display_url === 'string'
                ? mediaObj.display_url
                : typeof dataObj.display_url === 'string'
                ? dataObj.display_url
                : null;
    }

    if (!videoUrl) {
        const videoMatch = html.match(/"video_url":"([^"]+)"/) || 
                           html.match(/\\"video_url\\":\\"(.*?)\\"/) ||
                           html.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/) ||
                           html.match(/https?:\/\/[^"'\s]+\.fna\.fbcdn\.net\/[^^"'\s]+\.mp4[^"'\s]*/);
        
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
            displayUrl = displayMatch[1];
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
    }

    if (displayUrl) {
        console.debug(`[JS-IG] Found display_url: ${displayUrl.substring(0, 50)}...`);
        const hasVideo = newData.formats.some(f => f.is_video);
        const photoExists = newData.formats.some(f => f.format_id === 'photo');
        if (!photoExists) {
            newData.formats.push({
                format_id: 'photo',
                url: displayUrl,
                ext: 'jpg',
                resolution: hasVideo ? 'Thumbnail' : 'Image',
                vcodec: 'none',
                acodec: 'none',
                is_muxed: false,
                is_video: false,
                is_audio: false
            });
        }
    }

    if (!videoUrl && !displayUrl) {
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
                .replace(/\\u([0-9a-fA-F]{4})/g, (match: string, grp: string) => String.fromCharCode(parseInt(grp, 16)))
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
