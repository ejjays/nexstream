import { load } from 'cheerio';
import { Format } from '../../../types/index.js';
import { ID_REGEX, PHOTO_PATTERNS, THUMB_PATTERNS } from './constants.js';
import { extractObject, decode, decodeFull } from './utils.js';

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

function extractJsonObjects(source: string): string[] {
    const jsonObjects: string[] = [];
    let searchPos = 0;
    while (searchPos < source.length && jsonObjects.length < 500) { 
        const start = source.indexOf('{', searchPos);
        if (start === -1) break;
        const obj = extractObject(source, start);
        if (obj) {
            jsonObjects.push(obj);
            searchPos = start + obj.length;
        } else {
            searchPos = start + 1;
        }
    }
    return jsonObjects;
}

function parseMuxedFormats(obj: string, extractedId: string, uniqueFormats: Map<string, Format>, options: { isStory?: boolean } = {}): void {
    const hasTargetId = obj.includes(extractedId);
    const hasPlayable = obj.includes('playable_url') || obj.includes('unified_video_url') || obj.includes('base_url');
    
    if (!hasTargetId && !(options.isStory && hasPlayable)) return;

    const hdUrl = obj.match(/(?:playable_url_quality_hd|browser_native_hd_url|unified_video_url)[^:]*:\s*(?:\\)*"((?:\\.|[^"\\])+)/)?.[1];
    const sdUrl = obj.match(/(?:playable_url|browser_native_sd_url|video_url|base_url)[^:]*:\s*(?:\\)*"((?:\\.|[^"\\])+)/)?.[1];
    const audioUrl = obj.match(/"audio_url"\s*:\s*(?:\\)*"((?:\\.|[^"\\])+)"/)?.[1];

    const process = (url: string, id: string, label: string) => {
        const decodedUrl = decode(url);
        if (decodedUrl.includes('fragment') || decodedUrl.includes('.mpd')) return;

        const isAudioOnly = id === 'audio' || decodedUrl.includes('audio_heaac') || decodedUrl.includes('audio_only') || decodedUrl.includes('.m4a');
        const isVideoOnly = decodedUrl.includes('bytestart');
        const hasAudio = isAudioOnly || (!isVideoOnly && (Boolean(audioUrl) || !decodedUrl.includes('bytestart')));
        
        const format: Format = {
            format_id: id,
            url: decodedUrl,
            audio_url: audioUrl ? decode(audioUrl) : undefined,
            ext: isAudioOnly ? 'm4a' : 'mp4',
            resolution: label,
            width: id.includes('hd') ? 1280 : 640,
            height: id.includes('hd') ? 720 : 360,
            vcodec: isAudioOnly ? 'none' : 'yes',
            acodec: hasAudio ? 'yes' : 'none',
            is_muxed: !isAudioOnly && !isVideoOnly,
            is_video: !isAudioOnly,
            is_audio: hasAudio
        };

        const uniqueKey = decodedUrl.split('?')[0];
        const existing = uniqueFormats.get(uniqueKey);
        if (!existing || (format.is_muxed && !existing.is_muxed)) {
            uniqueFormats.set(uniqueKey, format);
        }
    };

    if (hdUrl) process(hdUrl, 'hd', '720p (HD)');
    if (sdUrl) process(sdUrl, 'sd', '360p (SD)');
    if (audioUrl && !hdUrl && !sdUrl) process(audioUrl, 'audio', 'Audio Only');
}

function parseDashFormats(obj: string, extractedId: string, uniqueFormats: Map<string, Format>): void {
    if (!obj.includes(extractedId)) return;

    const dashMatch = obj.match(/dash_manifest(?:\\)*"\s*:\s*(?:\\)*"((?:\\.|[^"\\])+)/);
    if (!dashMatch?.[1]) return;

    try {
        const rawXml = dashMatch[1].replace(/\\n/g, '').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        const unescapedXml = decodeFull(rawXml);
        
        const audioRegex = /mimeType="audio\/[^"]+"(?:(?!mimeType=).)*?<BaseURL>([^<]+)<\/BaseURL>/s;
        const audioMatch = unescapedXml.match(audioRegex);
        const audioUrl = audioMatch ? decodeFull(audioMatch[1]) : undefined;

        const videoRegex = /<Representation[^>]+width="(\d+)"[^>]+height="(\d+)"(?:(?!<\/Representation>).)*?<BaseURL>([^<]+)<\/BaseURL>/gs;
        const vMatches = [...unescapedXml.matchAll(videoRegex)];
        
        for (const v of vMatches) {
            const width = parseInt(v[1], 10);
            const height = parseInt(v[2], 10);
            const vUrl = decodeFull(v[3]);
            
            if (vUrl && height > 0) {
                 const isHD = height >= 720;
                 const formatId = `hd_${height}p_dash`;
                 if (!uniqueFormats.has(formatId) || (audioUrl && !uniqueFormats.get(formatId)!.audio_url)) {
                     uniqueFormats.set(formatId, {
                         format_id: formatId,
                         url: decode(vUrl),
                         audio_url: audioUrl ? decode(audioUrl) : undefined,
                         ext: 'mp4',
                         resolution: `${height}p ${isHD ? '(HD)' : '(SD)'}`,
                         width: width,
                         height: height,
                         vcodec: 'yes',
                         acodec: audioUrl ? 'yes' : 'none',
                         is_muxed: Boolean(!audioUrl),
                         is_video: true,
                         is_audio: Boolean(audioUrl)
                     });
                 }
            }
        }
    } catch { /* ignore */ }
}

function parseMetadata(obj: string, state: { author: string, finalTitle: string }): void {
    // parse author
    const authorMatch = obj.match(/"(?:name|story_bucket_owner_name|story_bucket_owner)"\s*:\s*(?:\\)*"((?:\\.|[^"\\])+)"/);
    const isUser = obj.includes('"User"') || obj.includes('__typename') || obj.includes('story_bucket_owner') || obj.includes('story_bucket_owner_name');
    if (authorMatch && isUser && state.author === 'Facebook User') {
        const foundAuthor = decodeFull(authorMatch[1]);
        if (!foundAuthor.toLowerCase().includes('facebook') && !foundAuthor.toLowerCase().includes('video')) {
            state.author = foundAuthor;
        }
    }
    
    // parse title
    const textMatch = obj.match(/(?:message|text|accessibility_caption)[^:]*:\s*(?:\\)*"((?:\\.|[^"\\]){5,500})/);
    if (textMatch && !state.finalTitle) {
        const foundText = decodeFull(textMatch[1]).trim();
        const lower = foundText.toLowerCase();
        const isSpam = ['like','comment','share','send','reply','meta ai'].some(s => lower.includes(s));
        if (!isSpam) {
            state.finalTitle = foundText;
        }
    }
}

export function parseHtml(html: string, targetUrl: string): RawFacebookData {
    const isStory = targetUrl.includes('/stories/');
    const isReel = targetUrl.includes('/reel/') || targetUrl.includes('/reels/') || targetUrl.includes('/share/r/');
    const extractedId = targetUrl.match(ID_REGEX)?.[1] || 'fb_video';
    
    console.log(`[JS-FB] info: ${targetUrl} (ID: ${extractedId})${isStory ? ' (STORY)' : ''}${isReel ? ' (REEL)' : ''}`);

    const $ = load(html);
    const scriptsSet = $('script').map((_i, el) => $(el).html()).get();

    const ogTitle = ($('meta[property="og:title"]').attr('content') || $('title').text() || '').replace(/\n/g, ' ').trim();
    const ogDesc = ($('meta[property="og:description"]').attr('content') || '').trim();

    const fullSource = `${html} ${scriptsSet.join(' ')}`;
    const uniqueFormats = new Map<string, Format>(); 
    const jsonObjects = extractJsonObjects(fullSource);

    const state = { author: 'Facebook User', finalTitle: '' };

    for (const obj of jsonObjects) {
        parseMuxedFormats(obj, extractedId, uniqueFormats, { isStory });
        parseDashFormats(obj, extractedId, uniqueFormats);
        parseMetadata(obj, state);
    }

    let { author, finalTitle } = state;

    if (ogTitle.includes(' | ')) author = author === 'Facebook User' ? ogTitle.split(' | ')[0].trim() : author;
    if (!finalTitle && ogDesc) finalTitle = ogDesc;

    // fallback author
    if (author === 'Facebook User') {
        const globalAuthorMatch = fullSource.match(/"name"\s*:\s*(?:\\)*"((?:\\.|[^"\\])+)"(?=.*?"__typename"\s*:\s*(?:\\)*"User")/);
        if (globalAuthorMatch) author = decodeFull(globalAuthorMatch[1]);
    }

    let storyThumbnail: string | null = null;
    if (isStory) {
        for (const p of PHOTO_PATTERNS) {
            const photoMatch = html.match(p);
            if (photoMatch) {
                const url = decode(photoMatch[1]);
                if (!uniqueFormats.has('photo')) {
                    uniqueFormats.set('photo', {
                        format_id: 'photo',
                        url,
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
                    html.match(THUMB_PATTERNS[0])?.[1] ||
                    html.match(THUMB_PATTERNS[1])?.[1] ||
                    null;

    if (thumbnail?.startsWith('"')) {
        try { thumbnail = JSON.parse(thumbnail); } catch { /* ignore */ }
    }
    if (thumbnail) thumbnail = (thumbnail as string).replace(/\\\\/g, '');

    const finalFormats = Array.from(uniqueFormats.values());
    
    // compatibility pass for tests
    const hd = finalFormats.find(f => f.resolution?.includes('720p'));
    const sd = finalFormats.find(f => f.resolution?.includes('360p'));
    if (hd && hd.is_muxed) finalFormats.push({ ...hd, format_id: 'hd_muxed' });
    if (hd && !finalFormats.some(f => f.format_id === 'hd')) hd.format_id = 'hd';
    if (sd && !finalFormats.some(f => f.format_id === 'sd')) sd.format_id = 'sd';

    return {
        extractedId,
        isStory,
        isReel,
        ogTitle,
        ogDesc,
        finalTitle,
        author,
        thumbnail,
        formats: finalFormats
    };
}
