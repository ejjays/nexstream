import { load } from 'cheerio';
import { VideoInfo, Format, ExtractorOptions } from '../../types/index.js';
import { Readable } from 'node:stream';
import axios from 'axios';

interface OEmbedData {
  title: string;
  author_name: string;
  thumbnail_url: string;
}

const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

async function expandTiktokUrl(url: string): Promise<string> {
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': MOBILE_UA },
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 400
        });
        return response.request.res.responseUrl || response.config.url || url;
    } catch (_error) {
        return url;
    }
}

export async function getInfo(url: string, _options: ExtractorOptions = {}): Promise<VideoInfo | null> {
  try {
    const targetUrl = await expandTiktokUrl(url);
    console.debug(`[JS-TK] Expanded URL: ${targetUrl}`);
    
    let title = '';
    let author = 'TikTok User';
    let thumbnail: string | null = null;

    // fetch oEmbed
    try {
        const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(targetUrl.split('?')[0])}`;
        const ores = await fetch(oembedUrl);
        if (ores.ok) {
            const odata: OEmbedData = await ores.json();
            title = odata.title;
            author = odata.author_name;
            thumbnail = odata.thumbnail_url;
        }
    } catch (error: unknown) { console.debug('[TikTokExtractor] oEmbed fetch error:', (error as Error).message); }

    // fetch page
    const res = await fetch(targetUrl, {
      headers: { 
        'User-Agent': MOBILE_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    if (!res.ok) return null;
    const html = await res.text();
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    const cookieStr = (setCookie as string[]).map(cookie => cookie.split(';')[0]).join('; ');
    
    // meta fallback
    if (!title || title === 'TikTok Video') {
        const cheerioDoc = load(html);
        title = cheerioDoc('meta[property="og:description"]').attr('content') || cheerioDoc('title').text();
        thumbnail = cheerioDoc('meta[property="og:image"]').attr('content') || null;
    }

    // parse addr
    const videoMatch = html.match(/"playAddr":"([^"]+)"/u) || 
                       html.match(/"downloadAddr":"([^"]+)"/u) ||
                       html.match(/play_addr":\{"url_list":\["([^"]+)"/u);

    let videoUrl: string | null = null;
    if (videoMatch) {
        videoUrl = videoMatch[1]
            .replace(/\u0026/gu, '&')
            .replace(/\\u0026/gu, '&')
            .replace(/\u002F/gu, '/')
            .replace(/\\u002F/gu, '/')
            .replace(/\\/gu, '');
    }

    if (!videoUrl) return null;

    // clean title
    if (title) {
        title = title.replace(/\\|\//gu, '/').split(' | ')[0].trim();
    }

    const formats: Format[] = [{
        format_id: 'best',
        url: videoUrl,
        ext: 'mp4',
        resolution: '720p (HD)',
        vcodec: 'yes',
        acodec: 'yes',
        is_muxed: true,
        is_video: true,
        is_audio: true
    }];

    // fetch size
    try {
        const sizeRes = await fetch(videoUrl, { 
            method: 'GET', 
            headers: { 
                'User-Agent': MOBILE_UA,
                'Range': 'bytes=0-0',
                'Referer': 'https://www.tiktok.com/',
                ...(cookieStr && { 'Cookie': cookieStr })
            },
            redirect: 'follow' 
        });
        
        const contentRange = sizeRes.headers.get('content-range');
        if (contentRange?.includes('/')) {
            formats[0].filesize = parseInt(contentRange.split('/')[1]);
        }
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.debug('[TikTokExtractor] Size fetch error:', error.message);
        } else {
            console.debug('[TikTokExtractor] Size fetch error:', error);
        }
    }

    return {
      id: targetUrl.split('/video/')[1]?.split('?')[0] || 'tiktok_video',
      extractor_key: 'tiktok',
      is_js_info: true,
      title: title || 'TikTok Video',
      uploader: author,
      author,
      thumbnail: thumbnail || '',
      webpage_url: targetUrl,
      formats
    };
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[JS-TK] Error: ${error.message}`);
    return null;
  }
}

export function getStream(_videoInfo: VideoInfo, _options: ExtractorOptions = {}): Promise<Readable> {
    throw new Error('JS Stream disabled for TikTok, using ytdlp');
}
