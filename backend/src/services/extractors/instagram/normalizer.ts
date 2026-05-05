import { VideoInfo } from '../../../types/index.js';
import { RawExtractedData } from './parser.js';

export function normalizeVideoInfo(shortcode: string, url: string, data: RawExtractedData): VideoInfo | null {
    if (data.isRestricted) {
        console.warn(`[JS-IG] Content restricted or unavailable for ${shortcode}`);
        return null;
    }
    
    if (data.formats.length === 0) return null;

    let cleanTitle = data.title;
    if (cleanTitle && cleanTitle !== 'Instagram Video') {
        cleanTitle = cleanTitle.split('\n')[0].trim();
        cleanTitle = cleanTitle.split(' | ')[0].trim();
        cleanTitle = cleanTitle.split(' • ')[0].trim();
        cleanTitle = cleanTitle.split(' \u00b7 ')[0].trim();
        cleanTitle = cleanTitle.replace(/\\\/|\\\\\/|\\|\//g, (match) => {
            if (match.includes('/')) return '/';
            return match;
        });
    }

    return {
        id: shortcode,
        extractor_key: 'instagram',
        is_js_info: true,
        title: (cleanTitle && cleanTitle !== 'Instagram Video') ? cleanTitle : `Instagram Reel by ${data.author}`,
        uploader: data.author || 'Instagram User',
        author: data.author || 'Instagram User',
        thumbnail: data.thumbnail || '',
        webpage_url: url,
        formats: data.formats
    };
}
