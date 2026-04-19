const cheerio = require('cheerio');

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

const HEADERS = {
    'User-Agent': DESKTOP_UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
};

async function resolveFacebookUrl(url) {
    try {
        const res = await fetch(url, { 
            method: 'GET', 
            headers: HEADERS,
            redirect: 'follow' 
        });
        return res.url;
    } catch (e) {
        return url;
    }
}

async function getInfo(url, options = {}) {
  try {
    // Resolve shortlinks/shares first to get the canonical URL
    const targetUrl = await resolveFacebookUrl(url);
    console.log(`[JS-FB] info: ${targetUrl}`);

    const res = await fetch(targetUrl, {
      headers: { 
        ...HEADERS,
        ...(options.cookie && { 'Cookie': options.cookie })
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    const formats = [];
    
    const addFormat = (rawUrl, id, label) => {
      if (!rawUrl) return;
      let cleanUrl = rawUrl;
      try {
        if (cleanUrl.startsWith('"') && cleanUrl.endsWith('"')) {
            cleanUrl = JSON.parse(cleanUrl);
        }
      } catch (e) {}

      cleanUrl = cleanUrl
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

    // Cobalt's primary patterns for HD/SD
    const hdPatterns = [
      /"browser_native_hd_url":"([^"]+)"/,
      /"browser_native_hd_url":(".*?")/,
      /"playable_url_quality_hd":"([^"]+)"/,
      /hd_src:"([^"]+)"/
    ];
    
    const sdPatterns = [
      /"browser_native_sd_url":"([^"]+)"/,
      /"browser_native_sd_url":(".*?")/,
      /"playable_url":"([^"]+)"/,
      /sd_src:"([^"]+)"/,
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

    // Fallback for older mobile pages if desktop fails
    if (formats.length === 0) {
      const metaVideo = $('meta[property="og:video"]').attr('content') || 
                        $('meta[property="og:video:url"]').attr('content');
      if (metaVideo) {
        const isLikelyHD = metaVideo.includes('_720p') || metaVideo.includes('hd_src');
        addFormat(metaVideo, 'best', isLikelyHD ? '720p (HD)' : '360p (SD)');
      }
    }

    if (formats.length === 0) return null;

    // Head check for file sizes
    await Promise.all(formats.map(async f => {
      try {
        const hRes = await fetch(f.url, { 
            method: 'HEAD', 
            headers: { 'User-Agent': DESKTOP_UA },
            signal: AbortSignal.timeout(2000) 
        });
        const len = hRes.headers.get('content-length');
        if (len) f.filesize = parseInt(len);
      } catch (e) {}
    }));

    const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
    let author = 'Facebook User';
    if (ogTitle.includes('|')) {
        const parts = ogTitle.split('|');
        if (parts.length >= 2) author = parts[parts.length - 2].trim();
    }

    return {
      id: targetUrl.match(/(?:v=|videos\/|reel\/|reels\/|share\/r\/)([a-zA-Z0-9_-]+)/)?.[1] || 'fb_video',
      title: ogTitle,
      uploader: author,
      author: author,
      thumbnail: $('meta[property="og:image"]').attr('content'),
      webpage_url: url,
      formats: formats
    };
  } catch (err) {
    console.error(`[JS-FB] Error: ${err.message}`);
    return null;
  }
}

async function getStream(videoInfo, options = {}) {
  const format = videoInfo.formats.find(f => String(f.format_id) === String(options.formatId)) || videoInfo.formats[0];
  if (!format || !format.url) throw new Error('No stream URL found');
  const { Readable } = require('node:stream');
  const response = await fetch(format.url, {
    headers: { 'User-Agent': DESKTOP_UA, 'Referer': 'https://www.facebook.com/' }
  });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return Readable.fromWeb(response.body);
}

module.exports = { getInfo, getStream };
