import { getQuantumStream } from '../../../utils/proxy.util.js';
import { VideoInfo, ExtractorOptions } from '../../../types/index.js';
import { Readable } from 'node:stream';
import { HEADERS, MOBILE_UA, fetchOembed, fetchGraphql, fetchEmbed, fetchFileSize } from './fetcher.js';
import { parseOembed, parseGraphql, parseEmbed, RawExtractedData } from './parser.js';
import { normalizeVideoInfo } from './normalizer.js';

export async function getInfo(url: string, options: ExtractorOptions = {}): Promise<VideoInfo | null> {
    const onProgress = options.onProgress || (() => {});

    try {
        const shortcode = url.split('/p/')[1]?.split('/')[0] || 
                          url.split('/reel/')[1]?.split('/')[0] || 
                          url.split('/reels/')[1]?.split('/')[0];
        
        if (!shortcode) return null;
        console.log(`[JS-IG] info: ${shortcode}`);
        onProgress('fetching_info', 15, 'Scanning Instagram Embeds...', 'NETWORK: INITIALIZING_IG_HANDSHAKE');

        let data: RawExtractedData = {
            title: '',
            author: 'Instagram User',
            thumbnail: null,
            formats: []
        };

        const cookie = typeof options.cookie === 'string' ? options.cookie : null;
        const fetchHeaders = {
            ...HEADERS,
            ...(cookie && { 'Cookie': cookie })
        };

        // try oEmbed
        try {
            const odata = await fetchOembed(shortcode, fetchHeaders);
            if (odata) {
                data = parseOembed(odata, data);
                onProgress('fetching_info', 18, 'Extracting OEmbed Meta...', 'API: RESOLVING_IG_OE_SIGNATURES');
            }
        } catch (e: any) { console.debug('[InstagramExtractor] oEmbed fetch error:', e.message); }

        // try gql
        try {
            const gqlData = await fetchGraphql(shortcode, fetchHeaders);
            if (gqlData) {
                data = parseGraphql(gqlData, data);
            }
        } catch (e: any) { console.debug('[InstagramExtractor] GraphQL fetch error:', e.message); }

        // try embed
        try {
            const html = await fetchEmbed(shortcode, fetchHeaders);
            if (html) {
                onProgress('fetching_info', 22, 'Decoding GraphQL streams...', 'PARSER: ANALYZING_JS_DOM_STRUCTURE');
                data = parseEmbed(html, data);
            }
        } catch (e: any) {
            console.error(`[JS-IG] Embed parser exception: ${e.message}`);
        }

        const videoInfo = normalizeVideoInfo(shortcode, url, data);
        
        if (videoInfo) {
            // fetch size
            await Promise.all(videoInfo.formats.map(async f => {
                if (f.url) {
                    const size = await fetchFileSize(f.url);
                    if (size) f.filesize = size;
                }
            }));
        }

        return videoInfo;
    } catch (err: unknown) {
        const error = err as Error;
        console.error(`[JS-IG] Error: ${error.message}`);
        return null;
    }
}

export async function getStream(videoInfo: VideoInfo, options: ExtractorOptions = {}): Promise<Readable> {
    const format = videoInfo.formats.find(f => String(f.format_id) === String(options.formatId)) || videoInfo.formats?.[0];
    if (!format || !format.url) throw new Error('No stream URL found');
    
    return await getQuantumStream(format.url, { 'User-Agent': MOBILE_UA, 'Referer': 'https://www.instagram.com/' });
}
