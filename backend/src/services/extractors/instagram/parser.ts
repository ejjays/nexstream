import { load } from 'cheerio';
import { Format } from '../../../types/index.js';

export interface RawExtractedData {
    title: string;
    author: string;
    thumbnail: string | null;
    formats: Format[];
    isRestricted?: boolean;
}

interface InstagramMedia {
    video_url?: string;
    display_url?: string;
    display_src?: string;
    is_video?: boolean;
    edge_sidecar_to_children?: {
        edges: Array<{
            node: InstagramMedia;
        }>
    };
    owner?: {
        username?: string;
    };
    thumbnail_src?: string;
    edge_media_to_caption?: {
        edges: Array<{
            node: {
                text: string;
            }
        }>
    };
}

interface EmbedJsonData extends InstagramMedia {
    shortcode_media?: InstagramMedia;
    graphql?: {
        shortcode_media?: InstagramMedia;
    };
    caption?: string;
    _extractedMedia?: InstagramMedia;
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
    const media = (gqlData as { data?: { xdt_shortcode_media?: InstagramMedia } })?.data?.xdt_shortcode_media;
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
        if (media.display_url) {
            const hasVideo = newData.formats.some(format => format.is_video);
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

function findJsonData(html: string, cheerioDoc: ReturnType<typeof load>): EmbedJsonData | null {
    try {
        const jsonMatch = html.match(/window\.__additionalDataLoaded\s*\(.*,\s*(\{.*\})\s*\);/u) || 
                          html.match(/window\._sharedData\s*=\s*(\{.*\});/u);
        
        if (jsonMatch) return JSON.parse(jsonMatch[1]) as EmbedJsonData;

        const scriptBlocks = cheerioDoc('script').toArray();
        for (const script of scriptBlocks) {
            const content = cheerioDoc(script).html();
            if (content?.includes('video_url')) {
                const jsonMatches = content.match(/(\{.*?\})/gu) || [content.match(/\{.*\}/u)?.[0]];
                for (const matchStr of jsonMatches) {
                    if (!matchStr) continue;
                    try {
                        const parsed = JSON.parse(matchStr) as EmbedJsonData;
                        const media = parsed.shortcode_media || parsed.graphql?.shortcode_media || (parsed as InstagramMedia);
                        let targetMedia = media;
                        if (media?.edge_sidecar_to_children?.edges?.length && media.edge_sidecar_to_children.edges.length > 0) {
                            const firstVideo = media.edge_sidecar_to_children.edges.find((edge) => edge.node?.is_video || edge.node?.video_url);
                            if (firstVideo) targetMedia = firstVideo.node;
                        }

                        if (targetMedia?.video_url) {
                            parsed._extractedMedia = targetMedia;
                            return parsed;
                        }
                    } catch (_e) { /* ignore */ }
                }
            }
        }
    } catch (_e) { /* ignore */ }
    return null;
}

function getMediaUrls(html: string, jsonData: EmbedJsonData | null): { videoUrl: string | null, displayUrl: string | null } {
    let videoUrl: string | null = null;
    let displayUrl: string | null = null;

    if (jsonData) {
        const mediaObj = jsonData._extractedMedia || jsonData.shortcode_media || jsonData.graphql?.shortcode_media || (jsonData as InstagramMedia);
        videoUrl = mediaObj.video_url || jsonData.video_url || null;
        displayUrl = mediaObj.display_url || jsonData.display_url || null;
    }

    if (!videoUrl) {
        const videoMatch = html.match(/"video_url":"([^"]+)"/u) || 
                           html.match(/"video_url":"(.*?)"/u) ||
                           html.match(/https?:\/u\/[^"'\s]+\.mp4[^"'\s]*/u) ||
                           html.match(/https?:\/u\/[^"'\s]+\.fna\.fbcdn\.net\/[^"'\s]+\.mp4[^"'\s]*/u);
        
        if (videoMatch) {
            videoUrl = videoMatch[1] || videoMatch[0];
            videoUrl = videoUrl
                .replace(/\u0026/gu, '&')
                .replace(/\\u0026/gu, '&')
                .replace(/\\/gu, '');
        }
    }

    if (!displayUrl) {
        const displayMatch = html.match(/"display_url":"([^"]+)"/u) || 
                           html.match(/"display_url":"(.*?)"/u) ||
                           html.match(/"display_src":"([^"]+)"/u) ||
                           html.match(/"display_src":"(.*?)"/u);
        
        if (displayMatch) {
            displayUrl = displayMatch[1]
                .replace(/\u0026/gu, '&')
                .replace(/\\u0026/gu, '&')
                .replace(/\\/gu, '');
        } else {
            const cheerioDoc = load(html);
            displayUrl = cheerioDoc('meta[property="og:image"]').attr('content') || null;
        }
    }

    return { videoUrl, displayUrl };
}

function extractCaption(html: string, jsonData: EmbedJsonData | null, cheerioDoc: ReturnType<typeof load>): string {
    let caption = '';
    if (jsonData) {
        caption = jsonData.caption || 
                  jsonData.shortcode_media?.edge_media_to_caption?.edges?.[0]?.node?.text ||
                  jsonData.graphql?.shortcode_media?.edge_media_to_caption?.edges?.[0]?.node?.text || '';
    }

    if (!caption) {
        const captionMatch = html.match(/"caption":"(.*?)"/u) || html.match(/"caption":"([^"]+)"/u);
        if (captionMatch) {
            caption = captionMatch[1]
                .replace(/\\u([0-9a-fA-F]{4})/gu, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
                .replace(/\\n/gu, '\n')
                .replace(/\n/gu, '\n')
                .replace(/"/gu, '"');
        }
    }

    if (!caption) {
        caption = cheerioDoc('.CaptionText').text().trim();
    }

    return caption;
}

export function parseEmbed(html: string, currentData: RawExtractedData): RawExtractedData {
    const newData = { ...currentData };
    
    if (
        html.includes('may have been removed') || 
        html.includes("This content isn't available") ||
        html.includes('Welcome back to Instagram')
    ) {
        newData.isRestricted = true;
        return newData;
    }

    const cheerioDoc = load(html);
    const jsonData = findJsonData(html, cheerioDoc);
    const { videoUrl, displayUrl } = getMediaUrls(html, jsonData);

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
        const hasVideo = newData.formats.some(format => format.is_video);
        if (!newData.formats.some(format => format.format_id === 'photo')) {
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

    const embedAuthor = cheerioDoc('.UsernameText').text().trim();
    if (embedAuthor) newData.author = embedAuthor;
    
    const caption = extractCaption(html, jsonData, cheerioDoc);

    const possibleTitles = [
        caption,
        cheerioDoc('meta[property="og:title"]').attr('content'),
        cheerioDoc('meta[property="og:description"]').attr('content'),
        cheerioDoc('meta[name="description"]').attr('content'),
        cheerioDoc('link[rel="alternate"][title]').attr('title')
    ].filter((title): title is string => Boolean(title && title !== 'Instagram Video' && !title.includes('See Instagram photos and videos')));

    if (possibleTitles.length > 0) {
        newData.title = caption || possibleTitles.reduce((prev, curr) => prev.length > curr.length ? prev : curr);
    }


    if (!newData.thumbnail) {
        newData.thumbnail = jsonData?.display_url || 
                            jsonData?.shortcode_media?.display_url ||
                            cheerioDoc('meta[property="og:image"]').attr('content') || 
                            cheerioDoc('.EmbeddedMediaImage').attr('src') || null;
    }

    return newData;
}
