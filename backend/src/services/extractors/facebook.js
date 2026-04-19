const cheerio = require('cheerio');

const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

async function getInfo(url, options = {}) {
  try {
    let mobileUrl = url.replace('www.facebook.com', 'm.facebook.com');
    
    console.log(`[JS-FB] info: ${mobileUrl}`);

    const res = await fetch(mobileUrl, {
      headers: { 
        'User-Agent': MOBILE_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        ...(options.cookie && { 'Cookie': options.cookie })
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    const formats = [];
    
    // add video format
    const addFormat = (rawUrl, id, label) => {
      if (!rawUrl) return;
      const cleanUrl = rawUrl
        .replace(/\\u0026/g, '&')
        .replace(/\\u003d/g, '=')
        .replace(/\\/g, '');
        
      if (formats.some(f => f.url === cleanUrl)) return;
      
      formats.push({
        format_id: id,
        url: cleanUrl,
        ext: 'mp4',
        resolution: label,
        is_muxed: true,
        is_video: true,
        is_audio: true
      });
    };

    // find quality patterns
    const hdPatterns = [
      /"playable_url_quality_hd":"([^"]+)"/,
      /hd_src:"([^"]+)"/,
      /"browser_native_hd_url":"([^"]+)"/
    ];
    
    const sdPatterns = [
      /"playable_url":"([^"]+)"/,
      /sd_src:"([^"]+)"/,
      /"browser_native_sd_url":"([^"]+)"/,
      /"video_url":"([^"]+)"/
    ];

    let hdUrl = null;
    for (const p of hdPatterns) {
      const m = html.match(p);
      if (m) { hdUrl = m[1]; break; }
    }

    let sdUrl = null;
    for (const p of sdPatterns) {
      const m = html.match(p);
      if (m) { sdUrl = m[1]; break; }
    }

    if (hdUrl) addFormat(hdUrl, 'hd', '720p (HD)');
    if (sdUrl) addFormat(sdUrl, 'sd', '360p (SD)');

    // meta fallback
    if (formats.length === 0) {
      const metaVideo = $('meta[property="og:video"]').attr('content') || 
                        $('meta[property="og:video:url"]').attr('content');
      if (metaVideo) {
        const isLikelyHD = metaVideo.includes('_720p') || metaVideo.includes('hd_src');
        addFormat(metaVideo, 'best', isLikelyHD ? '720p (HD)' : '360p (SD)');
      }
    }

    if (formats.length === 0) return null;

    // get file sizes
    await Promise.all(formats.map(async f => {
      try {
        const hRes = await fetch(f.url, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
        const len = hRes.headers.get('content-length');
        if (len) f.filesize = parseInt(len);
      } catch (e) {}
    }));

    const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
    
    // extract author
    let author = 'Facebook User';
    if (ogTitle.includes('|')) {
        const parts = ogTitle.split('|');
        if (parts.length >= 2) author = parts[parts.length - 2].trim();
    }

    return {
      id: url.match(/(?:v=|videos\/|reel\/|reels\/|share\/r\/)([a-zA-Z0-9_-]+)/)?.[1] || 'fb_video',
      title: ogTitle,
      uploader: author,
      author: author,
      thumbnail: $('meta[property="og:image"]').attr('content'),
      webpage_url: url,
      formats: formats
    };
  } catch (err) {
    return null;
  }
}

async function getStream(videoInfo, options = {}) {
  const format = videoInfo.formats.find(f => String(f.format_id) === String(options.formatId)) || videoInfo.formats[0];
  if (!format || !format.url) throw new Error('No stream URL found');
  const { Readable } = require('node:stream');
  const response = await fetch(format.url, {
    headers: { 'User-Agent': MOBILE_UA, 'Referer': 'https://www.facebook.com/' }
  });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return Readable.fromWeb(response.body);
}

module.exports = { getInfo, getStream };
