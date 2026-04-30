import { load } from 'cheerio';
import { VideoInfo, Format, ExtractorOptions } from '../../types/index.js';

const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

export async function getInfo(url: string, options: ExtractorOptions = {}): Promise<VideoInfo | null> {
  try {
    // 1. resolve actual video page
    const headRes = await fetch(url, { 
      method: 'GET', 
      headers: { 'User-Agent': MOBILE_UA },
      redirect: 'follow' 
    });
    const targetUrl = headRes.url;
    console.log(`[JS-TK] info: ${targetUrl}`);

    let title = '';
    let author = 'TikTok User';
    let thumbnail: string | null = null;

    // 2. try oEmbed for metadata (generic UA for better compatibility)
    try {
        const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(targetUrl.split('?')[0])}`;
        const ores = await fetch(oembedUrl);
        if (ores.ok) {
            const odata: any = await ores.json();
            title = odata.title;
            author = odata.author_name;
            thumbnail = odata.thumbnail_url;
        }
    } catch (e) {}

    // 3. fetch page for video URL and size
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
    const cookieStr = setCookie.map(c => c.split(';')[0]).join('; ');
    
    // fallback metadata if oEmbed failed
    if (!title || title === 'TikTok Video') {
        const $ = load(html);
        title = $('meta[property="og:description"]').attr('content') || $('title').text();
        thumbnail = $('meta[property="og:image"]').attr('content') || null;
    }

    // 4. Match playAddr
    const videoMatch = html.match(/"playAddr":"([^"]+)"/) || 
                       html.match(/"downloadAddr":"([^"]+)"/) ||
                       html.match(/play_addr":{"url_list":\["([^"]+)"/);

    let videoUrl: string | null = null;
    if (videoMatch) {
        videoUrl = videoMatch[1]
            .replace(/\u0026/g, '&')
            .replace(/\\u0026/g, '&')
            .replace(/\u002F/g, '/')
            .replace(/\\u002F/g, '/')
            .replace(/\\/g, '');
    }

    if (!videoUrl) return null;

    // clean title
    if (title) {
        title = title.replace(/\\|\//g, '/').split(' | ')[0].trim();
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

    // 5. force get size using same session
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
        if (contentRange && contentRange.includes('/')) {
            formats[0].filesize = parseInt(contentRange.split('/')[1]);
        }
    } catch (e) {}

    return {
      id: targetUrl.split('/video/')[1]?.split('?')[0] || 'tiktok_video',
      extractor_key: 'tiktok',
      is_js_info: true,
      title: title || 'TikTok Video',
      uploader: author,
      author: author,
      thumbnail: thumbnail || '',
      webpage_url: targetUrl,
      formats: formats
    };
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[JS-TK] Error: ${error.message}`);
    return null;
  }
}

export async function getStream(videoInfo: VideoInfo, options: ExtractorOptions = {}): Promise<Readable> {
    throw new Error('JS Stream disabled for TikTok, using ytdlp');
}
