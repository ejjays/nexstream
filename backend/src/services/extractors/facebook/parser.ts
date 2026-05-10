import { load } from 'cheerio';
import { Format } from '../../../types/index.js';
import * as Constants from './constants.js';
import * as Utils from './utils.js';

export interface RawFacebookData {
    extractedId: string;
    isStory: boolean;
    isReel: boolean;
    ogTitle: string;
    ogDesc: string;
    finalTitle: string;
    author: string;
    thumbnail: string | null;
    formats: Format[];
}

export function parseHtml(html: string, targetUrl: string, cookieName?: string): RawFacebookData {
    const isStory = targetUrl.includes('/stories/');
    const isReel = targetUrl.includes('/reel/') || targetUrl.includes('/reels/') || targetUrl.includes('/share/r/');
    const extractedId = targetUrl.match(Constants.ID_REGEX)?.[1] || 'fb_video';
    
    console.log(`[JS-FB] info: ${targetUrl} (ID: ${extractedId})${isStory ? ' (STORY)' : ''}${isReel ? ' (REEL)' : ''}`);

    const $ = load(html);
    const scriptsSet = $('script').map((i, el) => $(el).html()).get();

    let ogTitle = ($('meta[property="og:title"]').attr('content') || $('title').text() || '').replace(/\n/g, ' ').trim();
    let ogDesc = ($('meta[property="og:description"]').attr('content') || '').trim();

    const fullSource = html + ' ' + scriptsSet.join(' ');
    const uniqueFormats = new Map<string, Format>(); 

    // find objects
    const jsonObjects: string[] = [];
    let searchPos = 0;
    while (searchPos < fullSource.length && jsonObjects.length < 500) { 
        const start = fullSource.indexOf('{', searchPos);
        if (start === -1) break;
        const obj = Utils.extractObject(fullSource, start);
        if (obj) {
            jsonObjects.push(obj);
            searchPos = start + obj.length;
        } else {
            searchPos = start + 1;
        }
    }

    let author = 'Facebook User';
    let finalTitle = '';

    for (const obj of jsonObjects) {
        // match ID
        if (obj.includes(extractedId)) {
            // parse formats
            const hdMatch = obj.match(/(?:playable_url_quality_hd|browser_native_hd_url)[^\:]*\:\s*(?:\\)*"((?:\\.|[^"\\])+)/);
            const sdMatch = obj.match(/(?:playable_url|browser_native_sd_url|video_url)[^\:]*\:\s*(?:\\)*"((?:\\.|[^"\\])+)/);

            if (hdMatch && hdMatch[1] && !uniqueFormats.has('hd_720p_muxed')) {
                uniqueFormats.set('hd_720p_muxed', {
                    format_id: 'hd_720p_muxed',
                    url: Utils.decode(hdMatch[1]),
                    ext: 'mp4',
                    resolution: '720p (HD Muxed)',
                    width: 1280,
                    height: 720,
                    vcodec: 'yes',
                    acodec: 'yes',
                    is_muxed: true,
                    is_video: true,
                    is_audio: true
                });
            }
            if (sdMatch && sdMatch[1] && !uniqueFormats.has('sd_360p_muxed')) {
                uniqueFormats.set('sd_360p_muxed', {
                    format_id: 'sd_360p_muxed',
                    url: Utils.decode(sdMatch[1]),
                    ext: 'mp4',
                    resolution: '360p (SD Muxed)',
                    width: 640,
                    height: 360,
                    vcodec: 'yes',
                    acodec: 'yes',
                    is_muxed: true,
                    is_video: true,
                    is_audio: true
                });
            }

            // check DASH
            const dashMatch = obj.match(/dash_manifest(?:\\)*"\s*:\s*(?:\\)*"((?:\\.|[^"\\])+)/);
            if (dashMatch && dashMatch[1]) {
                try {
                    const rawXml = dashMatch[1].replace(/\\n/g, '').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                    const unescapedXml = Utils.decodeFull(rawXml);
                    
                    const audioRegex = /mimeType="audio\/[^"]+"(?:(?!mimeType=).)*?<BaseURL>([^<]+)<\/BaseURL>/s;
                    const audioMatch = unescapedXml.match(audioRegex);
                    const audioUrl = audioMatch ? Utils.decodeFull(audioMatch[1]) : undefined;

                    const videoRegex = /<Representation[^>]+width="(\d+)"[^>]+height="(\d+)"(?:(?!<\/Representation>).)*?<BaseURL>([^<]+)<\/BaseURL>/gs;
                    const vMatches = [...unescapedXml.matchAll(videoRegex)];
                    
                    for (const v of vMatches) {
                        const width = parseInt(v[1], 10);
                        const height = parseInt(v[2], 10);
                        const vUrl = Utils.decodeFull(v[3]);
                        
                        if (vUrl && height > 0) {
                             const isHD = height >= 720;
                             const formatId = `hd_${height}p_dash`;
                             if (!uniqueFormats.has(formatId) || (audioUrl && !uniqueFormats.get(formatId)!.audio_url)) {
                                 uniqueFormats.set(formatId, {
                                     format_id: formatId,
                                     url: Utils.decode(vUrl),
                                     audio_url: audioUrl ? Utils.decode(audioUrl) : undefined,
                                     ext: 'mp4',
                                     resolution: `${height}p ${isHD ? '(HD)' : '(SD)'}`,
                                     width: width,
                                     height: height,
                                     vcodec: 'yes',
                                     acodec: audioUrl ? 'yes' : 'none',
                                     is_muxed: !audioUrl,
                                     is_video: true,
                                     is_audio: !!audioUrl
                                 });
                             }
                        }
                    }
                } catch (e: unknown) { }
            }
        }

        // parse metadata
        const authorMatch = obj.match(/\"name\"\s*\:\s*(?:\\)*\"((?:\\.|[^\"\\])+)\"/);
        const isUser = obj.includes('"User"') || obj.includes('__typename');
        if (authorMatch && isUser && author === 'Facebook User') {
            const foundAuthor = Utils.decodeFull(authorMatch[1]);
            if (!foundAuthor.toLowerCase().includes('facebook') && !foundAuthor.toLowerCase().includes('video')) {
                author = foundAuthor;
            }
        }
        
        // parse title
        const textMatch = obj.match(/(?:message|text|accessibility_caption)[^\:]*\:\s*(?:\\)*"((?:\\.|[^"\\]){5,500})/);
        if (textMatch && !finalTitle) {
            const foundText = Utils.decodeFull(textMatch[1]).trim();
            const lower = foundText.toLowerCase();
            if (!['like','comment','share','send','reply','meta ai'].some(s => lower.includes(s))) {
                finalTitle = foundText;
            }
        }
    }

    if (ogTitle.includes(' | ')) author = author === 'Facebook User' ? ogTitle.split(' | ')[0].trim() : author;
    if (!finalTitle && ogDesc) finalTitle = ogDesc;

    // fallback author
    if (author === 'Facebook User') {
        const globalAuthorMatch = fullSource.match(/\"name\"\s*\:\s*(?:\\)*\"((?:\\.|[^\"\\])+)\"(?=.*?\"__typename\"\s*\:\s*(?:\\)*\"User\")/);
        if (globalAuthorMatch) author = Utils.decodeFull(globalAuthorMatch[1]);
    }

    let storyThumbnail: string | null = null;
    if (isStory) {
        for (const p of Constants.PHOTO_PATTERNS) {
            const photoMatch = html.match(p);
            if (photoMatch) {
                const url = Utils.decode(photoMatch[1]);
                if (!uniqueFormats.has('photo')) {
                    uniqueFormats.set('photo', {
                        format_id: 'photo',
                        url: url,
                        ext: 'jpg',
                        resolution: 'Original Photo',
                        vcodec: 'none',
                        acodec: 'none',
                        is_muxed: false,
                        is_video: false,
                        is_audio: false
                    });
                }
                storyThumbnail = url;
                break;
            }
        }
    }

    let thumbnail: string | null = storyThumbnail || 
                    $('meta[property="og:image"]').attr('content') || 
                    html.match(Constants.THUMB_PATTERNS[0])?.[1] ||
                    html.match(Constants.THUMB_PATTERNS[1])?.[1] ||
                    null;

    if (thumbnail && thumbnail.startsWith('"')) {
        try { thumbnail = JSON.parse(thumbnail); } catch(e: unknown) { }
    }
    if (thumbnail) thumbnail = (thumbnail as string).replace(/\\\\/g, '');

    const formats: Format[] = Array.from(uniqueFormats.values());

    return {
        extractedId,
        isStory,
        isReel,
        ogTitle,
        ogDesc,
        finalTitle,
        author,
        thumbnail,
        formats
    };
}
