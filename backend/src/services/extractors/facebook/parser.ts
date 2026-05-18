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

function extractJsonObjects(source: string, extractedId?: string): string[] {
    const jsonObjects: string[] = [];

    if (source.length < 500000) {
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

    const keywords = ['playable_url', 'unified_video_url', 'base_url', 'dash_manifest', 'story_bucket_owner', 'audio_url'];
    if (extractedId) keywords.push(extractedId);

    const searchStarts = new Set<number>();
    for (const kw of keywords) {
        let pos = 0;
        while ((pos = source.indexOf(kw, pos)) !== -1) {
            const limit = Math.max(0, pos - 50000);
            let bracePos = pos;
            let foundCount = 0;
            while ((bracePos = source.lastIndexOf('{', bracePos - 1)) !== -1 && bracePos >= limit) {
                searchStarts.add(bracePos);
                if (++foundCount > 20) break; 
            }
            pos += kw.length + 10000; 
        }
    }

    const sortedStarts = Array.from(searchStarts).sort((a, b) => a - b);
    let lastEnd = 0;

    for (const start of sortedStarts) {
        if (start < lastEnd) continue;
        const obj = extractObject(source, start);
        if (obj) {
            jsonObjects.push(obj);
            lastEnd = start + obj.length;
        }
    }

    return jsonObjects;
}





function parseMuxedFormats(obj: string, extractedId: string, uniqueFormats: Map<string, Format>, options: { isStory?: boolean } = {}): void {
    const hasTargetId = obj.includes(extractedId);
    const hasPlayable = obj.includes('playable_url') || obj.includes('unified_video_url') || obj.includes('base_url');
    
    if (!hasTargetId && !(options.isStory && hasPlayable)) return;

    const hdUrl = obj.match(/(?:playable_url_quality_hd|browser_native_hd_url|unified_video_url)[^:]*:\s*(?:\\)*"((?:\\.|[^"\\])+)/u)?.[1];
    const sdUrl = obj.match(/(?:playable_url|browser_native_sd_url|video_url|base_url)[^:]*:\s*(?:\\)*"((?:\\.|[^"\\])+)/u)?.[1];
    const audioUrl = obj.match(/"audio_url"\s*:\s*(?:\\)*"((?:\\.|[^"\\])+)"/u)?.[1];

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

    const dashMatch = obj.match(/dash_manifest(?:\\)*"\s*:\s*(?:\\)*"((?:\\.|[^"\\])+)/u);
    if (!dashMatch?.[1]) return;

    try {
        const rawXml = dashMatch[1].replace(/\\n/gu, '').replace(/\\"/gu, '"').replace(/\\\\/gu, '\\');
        const unescapedXml = decodeFull(rawXml);
        
    const audioRegex = /mimeType="audio\/[^"]+"(?:(?!mimeType=).)*?<BaseURL>([^<]+)<\/BaseURL>/su;
        const audioMatch = unescapedXml.match(audioRegex);
        const dashAudioUrl = audioMatch ? decodeFull(audioMatch[1]) : undefined;

        const videoRegex = /<Representation[^>]+width="(\d+)"[^>]+height="(\d+)"(?:(?!<\/Representation>).)*?<BaseURL>([^<]+)<\/BaseURL>/gsu;
        const videoMatches = [...unescapedXml.matchAll(videoRegex)];
        
        for (const match of videoMatches) {
            const width = parseInt(match[1], 10);
            const height = parseInt(match[2], 10);
            const vUrl = decodeFull(match[3]);
            
            if (vUrl && height > 0) {
                 const isHD = height >= 720;
                 const formatId = `hd_${height}p_dash`;
                 const existing = uniqueFormats.get(formatId);
                 if (!existing || (dashAudioUrl && !existing.audio_url)) {
                     uniqueFormats.set(formatId, {
                         format_id: formatId,
                         url: decode(vUrl),
                         audio_url: dashAudioUrl ? decode(dashAudioUrl) : undefined,
                         ext: 'mp4',
                         resolution: `${height}p ${isHD ? '(HD)' : '(SD)'}`,
                         width,
                         height,
                         vcodec: 'yes',
                         acodec: dashAudioUrl ? 'yes' : 'none',
                         is_muxed: Boolean(!dashAudioUrl),
                         is_video: true,
                         is_audio: Boolean(dashAudioUrl)
                     });
                 }
            }
        }
    } catch { /* ignore */ }
}

function getFallbackAuthor(fullSource: string, currentAuthor: string): string {
    if (currentAuthor !== 'Facebook User') return currentAuthor;
    const globalAuthorMatch = fullSource.match(/"name"\s*:\s*(?:\\)*"((?:\\.|[^"\\])+)"(?=.*?"__typename"\s*:\s*(?:\\)*"User")/u);
    return globalAuthorMatch ? decodeFull(globalAuthorMatch[1]) : currentAuthor;
}

function getStoryThumbnail(html: string, uniqueFormats: Map<string, Format>): string | null {
    for (const pattern of PHOTO_PATTERNS) {
        const photoMatch = html.match(pattern);
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
            return url;
        }
    }
    return null;
}

function parseMetadata(obj: string, state: { author: string, finalTitle: string }): void {
    // parse author
    const authorMatch = obj.match(/"(?:name|story_bucket_owner_name|story_bucket_owner)"\s*:\s*(?:\\)*"((?:\\.|[^"\\])+)"/u);
    const isUser = obj.includes('"User"') || obj.includes('__typename') || obj.includes('story_bucket_owner') || obj.includes('story_bucket_owner_name');
    if (authorMatch && isUser && state.author === 'Facebook User') {
        const foundAuthor = decodeFull(authorMatch[1]);
        if (!foundAuthor.toLowerCase().includes('facebook') && !foundAuthor.toLowerCase().includes('video')) {
            state.author = foundAuthor;
        }
    }
    
    // parse title
    const textMatch = obj.match(/(?:message|text|accessibility_caption)[^:]*:\s*(?:\\)*"((?:\\.|[^"\\]){5,500})/u);
    if (textMatch && !state.finalTitle) {
        const foundText = decodeFull(textMatch[1]).trim();
        const lower = foundText.toLowerCase();
        const isSpam = ['like','comment','share','send','reply','meta ai'].some(term => lower.includes(term));
        if (!isSpam) {
            state.finalTitle = foundText;
        }
    }
}

function getOgMetadata(html: string): { ogTitle: string, ogDesc: string } {
    const cheerioDoc = load(html);
    const ogTitle = (cheerioDoc('meta[property="og:title"]').attr('content') || cheerioDoc('title').text() || '').replace(/\n/gu, ' ').trim();
    const ogDesc = (cheerioDoc('meta[property="og:description"]').attr('content') || '').trim();
    return { ogTitle, ogDesc };
}

function processThumbnail(html: string, isStory: boolean, uniqueFormats: Map<string, Format>): string | null {
    const storyThumbnail = isStory ? getStoryThumbnail(html, uniqueFormats) : null;
    const cheerioDoc = load(html);
    let thumbnail: string | null = storyThumbnail || 
                    cheerioDoc('meta[property="og:image"]').attr('content') || 
                    html.match(THUMB_PATTERNS[0])?.[1] ||
                    html.match(THUMB_PATTERNS[1])?.[1] ||
                    null;

    if (thumbnail?.startsWith('"')) {
        try { thumbnail = JSON.parse(thumbnail); } catch { /* ignore */ }
    }
    if (thumbnail) thumbnail = (thumbnail as string).replace(/\\/gu, '');
    return thumbnail;
}

function getFinalFormats(uniqueFormats: Map<string, Format>): Format[] {
    const formats = Array.from(uniqueFormats.values());
    const hd = formats.find(format => format.resolution?.includes('720p'));
    const sd = formats.find(format => format.resolution?.includes('360p'));
    if (hd?.is_muxed) formats.push({ ...hd, format_id: 'hd_muxed' });
    if (hd && !formats.some(format => format.format_id === 'hd')) hd.format_id = 'hd';
    if (sd && !formats.some(format => format.format_id === 'sd')) sd.format_id = 'sd';
    return formats;
}

export function parseHtml(html: string, targetUrl: string): RawFacebookData {
    const isStory = targetUrl.includes('/stories/');
    const isReel = targetUrl.includes('/reel/') || targetUrl.includes('/reels/') || targetUrl.includes('/share/r/');
    const extractedId = targetUrl.match(ID_REGEX)?.[1] || 'fb_video';
    
    console.log(`[JS-FB] info: ${targetUrl} (ID: ${extractedId})${isStory ? ' (STORY)' : ''}${isReel ? ' (REEL)' : ''}`);

    const { ogTitle, ogDesc } = getOgMetadata(html);
    const cheerioDoc = load(html);
    const scriptsSet = cheerioDoc('script').map((_i, el) => cheerioDoc(el).html()).get();

    const fullSource = `${html} ${scriptsSet.join(' ')}`;
    const uniqueFormats = new Map<string, Format>(); 
    const jsonObjects = extractJsonObjects(fullSource, extractedId);

    const state = { author: 'Facebook User', finalTitle: '' };

    for (const obj of jsonObjects) {
        parseMuxedFormats(obj, extractedId, uniqueFormats, { isStory });
        parseDashFormats(obj, extractedId, uniqueFormats);
        parseMetadata(obj, state);
    }

    const author = getFallbackAuthor(fullSource, ogTitle.includes(' | ') && state.author === 'Facebook User' ? ogTitle.split(' | ')[0].trim() : state.author);
    const finalTitle = state.finalTitle || ogDesc || ogTitle;
    const thumbnail = processThumbnail(html, isStory, uniqueFormats);
    const formats = getFinalFormats(uniqueFormats);

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
