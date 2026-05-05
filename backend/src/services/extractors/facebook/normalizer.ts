import { VideoInfo, Format } from '../../../types/index.js';
import { RawFacebookData } from './parser.js';

export function normalizeVideoInfo(targetUrl: string, data: RawFacebookData): VideoInfo | null {
    if (data.formats.length === 0) return null;

    const finalFormats = data.formats.filter((f: Format) => f.is_video || f.is_muxed || f.is_audio || f.format_id === 'photo');
    if (finalFormats.length === 0) return null;

    return {
        id: data.extractedId,
        extractor_key: 'facebook',
        is_js_info: true,
        title: data.finalTitle || data.ogTitle,
        uploader: data.author,
        author: data.author,
        description: data.finalTitle || data.ogDesc || data.ogTitle,
        thumbnail: data.thumbnail || '',
        webpage_url: targetUrl,
        formats: finalFormats
    };
}
