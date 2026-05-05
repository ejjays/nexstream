import { getQuantumStream } from '../../../utils/proxy.util.js';
import { VideoInfo, Format, ExtractorOptions } from '../../../types/index.js';
import { Readable } from 'node:stream';
import * as Constants from './constants.js';
import { fetchHtml, fetchFileSize } from './fetcher.js';
import { parseHtml } from './parser.js';
import { normalizeVideoInfo } from './normalizer.js';

export async function getInfo(url: string, options: ExtractorOptions = {}): Promise<VideoInfo | null> {
    try {
        const fetchResult = await fetchHtml(url, options);
        if (!fetchResult) return null;

        const { html, targetUrl } = fetchResult;
        
        const parsedData = parseHtml(html, targetUrl, options.cookie_name);
        
        const videoInfo = normalizeVideoInfo(targetUrl, parsedData);
        if (!videoInfo) return null;

        // fetch size
        for (let i = 0; i < videoInfo.formats.length; i += 3) {
            const batch = videoInfo.formats.slice(i, i + 3);
            await Promise.all(batch.map(async (f: Format) => {
                if (f.url) {
                    const size = await fetchFileSize(f.url);
                    if (size) f.filesize = size;
                }
            }));
        }

        return videoInfo;
    } catch (err: unknown) {
        const error = err as Error;
        console.error(`[JS-FB] Error extracting ${url}: ${error.message}`);
        return null;
    }
}

export async function getStream(videoInfo: VideoInfo, options: ExtractorOptions = {}): Promise<Readable> {
    const format = videoInfo.formats.find((f: Format) => String(f.format_id) === String(options.formatId)) || videoInfo.formats[0];
    if (!format || !format.url) throw new Error('No stream URL found');
    
    return await getQuantumStream(format.url, { 
        'User-Agent': Constants.DESKTOP_UA, 
        'Referer': 'https://www.facebook.com/',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Range': 'bytes=0-',
        'Origin': 'https://www.facebook.com',
        'Sec-Fetch-Dest': 'video',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site'
    });
}
