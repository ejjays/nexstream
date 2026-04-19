const cheerio = require('cheerio');

const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

async function getInfo(url) {
  try {
    let mobileUrl = url.replace('www.facebook.com', 'm.facebook.com');
    
    console.log(`[JS-FB] info: ${mobileUrl}`);

    const res = await fetch(mobileUrl, {
      headers: { 
        'User-Agent': MOBILE_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    // handle encoded urls
    const videoUrlMatch = 
      html.match(/"browser_native_hd_url":"([^"]+)"/)?.[1] ||
      html.match(/"browser_native_sd_url":"([^"]+)"/)?.[1] ||
      html.match(/hd_src:"([^"]+)"/)?.[1] ||
      html.match(/sd_src:"([^"]+)"/)?.[1] ||
      html.match(/"video_url":"([^"]+)"/)?.[1];
    
    const metaVideo = $('meta[property="og:video"]').attr('content') || 
                      $('meta[property="og:video:url"]').attr('content');
    
    let finalVideoUrl = videoUrlMatch || metaVideo;
    if (finalVideoUrl) {
      finalVideoUrl = finalVideoUrl.replace(/\\u0026/g, '&').replace(/\\/g, '');
    }

    if (!finalVideoUrl) {
        console.log('[JS-FB] No stream found, falling back to yt-dlp');
        return null;
    }

    const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
    
    // extract author name
    let author = 'Facebook User';
    if (ogTitle.includes('|')) {
        const parts = ogTitle.split('|');
        if (parts.length >= 2) {
            author = parts[parts.length - 2].trim();
        }
    }

    const thumbnail = $('meta[property="og:image"]').attr('content');
    
    // get file size
    let filesize = null;
    try {
        const headRes = await fetch(finalVideoUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
        const len = headRes.headers.get('content-length');
        if (len) filesize = parseInt(len);
    } catch (e) {}

    const isHD = (videoUrlMatch && (videoUrlMatch.includes('hd_src') || videoUrlMatch.includes('hd_url'))) || finalVideoUrl.includes('_720p');

    return {
      id: url.match(/v=(\d+)/)?.[1] || url.split('/').filter(Boolean).pop() || 'fb_video',
      title: ogTitle,
      uploader: author,
      author: author,
      thumbnail: thumbnail,
      webpage_url: url,
      formats: [{
          format_id: 'best',
          url: finalVideoUrl,
          ext: 'mp4',
          resolution: isHD ? '720p' : 'sd',
          filesize: filesize,
          is_muxed: true,
          is_video: true,
          is_audio: true
      }]
    };
  } catch (err) {
    return null;
  }
}

async function getStream(videoInfo, options = {}) {
  const format = videoInfo.formats?.[0];
  if (!format || !format.url) throw new Error('No stream URL found');
  const { Readable } = require('node:stream');
  const response = await fetch(format.url, {
    headers: { 'User-Agent': MOBILE_UA, 'Referer': 'https://www.facebook.com/' }
  });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return Readable.fromWeb(response.body);
}

module.exports = { getInfo, getStream };
