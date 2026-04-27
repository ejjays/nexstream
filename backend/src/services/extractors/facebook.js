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

async function resolveFacebookUrl(url, cookie = null) {
    try {
        const res = await fetch(url, { 
            method: 'GET', 
            headers: {
                ...HEADERS,
                ...(cookie && { 'Cookie': cookie })
            },
            redirect: 'follow' 
        });
        return res.url;
    } catch (e) {
        return url;
    }
}

async function getInfo(url, options = {}) {
  try {
    // resolve fb urls
    const cookie = options.cookie || null;
    const targetUrl = await resolveFacebookUrl(url, cookie);
    const isStory = targetUrl.includes('/stories/');
    console.log(`[JS-FB] info: ${targetUrl}${isStory ? ' (STORY)' : ''}`);

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
        vcodec: 'yes',
        acodec: 'yes',
        is_muxed: true,
        is_video: true,
        is_audio: true
      });
    };

    // extract story
    let storyThumbnail = null;
    if (isStory) {
        const storyPatterns = [
            /"unified_video_url":"([^"]+)"/,
            /"playable_url":"([^"]+)"/,
            /"playable_url_quality_hd":"([^"]+)"/
        ];

        for (const p of storyPatterns) {
            const matches = html.match(new RegExp(p, 'g'));
            if (matches) {
                matches.forEach(m => {
                    const urlMatch = m.match(p);
                    if (urlMatch && urlMatch[1]) {
                        const isHD = m.includes('quality_hd') || m.includes('unified_video_url');
                        addFormat(urlMatch[1], isHD ? 'hd' : 'sd', isHD ? '720p (HD)' : '360p (SD)');
                    }
                });
            }
        }

        // extract photo
        if (formats.length === 0) {
            const photoMatch = html.match(/"media":\{"__typename":"Photo",.*?"image":\{"uri":"([^"]+)"\}/) ||
                               html.match(/"story_card_info":\{.*?"story_thumbnail":\{"uri":"([^"]+)"\}/) ||
                               html.match(/"image":\{"uri":"([^"]+)"\}/);
            if (photoMatch) {
                const photoUrl = photoMatch[1].replace(/\\/g, '');
                formats.push({
                    format_id: 'photo',
                    url: photoUrl,
                    ext: 'jpg',
                    resolution: 'Original Photo',
                    vcodec: 'none',
                    acodec: 'none',
                    is_video: false,
                    is_audio: false
                });
                if (!storyThumbnail) storyThumbnail = photoUrl;
            }
        }

        // parse thumbnail
        const thumbMatch = html.match(/"preferred_thumbnail":{"image":{"uri":"([^"]+)"}/) ||
                           html.match(/"preview_image":{"uri":"([^"]+)"}/);
        if (thumbMatch) storyThumbnail = thumbMatch[1].replace(/\\/g, '');
    }

    // match hd patterns
    const hdPatterns = [
      /"browser_native_hd_url":"([^"]+)"/,
      /"browser_native_hd_url":(".*?")/,
      /"playable_url_quality_hd":"([^"]+)"/,
      /hd_src:"([^"]+)"/
    ];
    
    // match sd patterns
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

    // fetch file sizes
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
    
    // extract author
    let author = 'Facebook User';

    // try oembed title
    const altLinkTitle = $('link[rel="alternate"][type="application/json+oembed"]').attr('title');
    if (altLinkTitle && altLinkTitle.includes('|')) {
        const parts = altLinkTitle.split('|');
        const possibleAuthor = parts[parts.length - 1].trim();
        if (possibleAuthor && !possibleAuthor.toLowerCase().includes('facebook')) {
            author = possibleAuthor;
        }
    }

    // check script tags
    if (author === 'Facebook User') {
        const authorPatterns = [
            /"story_bucket_owner":\{.*?"name":"([^"]+)"/,
            /"story_bucket_owner_name":"([^"]+)"/,
            /"owner":\{"__typename":"(?:User|Page)","name":"([^"]+)"/,
            /"author":\{"name":"([^"]+)"/,
            /"actor":{"name":"([^"]+)"/,
            /"ownerName":"([^"]+)"/,
            /"name":"([^"]+)"(?=,"profile_picture")/
        ];

        for (const p of authorPatterns) {
            const m = html.match(p);
            // filter bundle names
            if (m && m[1] && 
                !m[1].toLowerCase().includes('facebook') && 
                !m[1].includes('Bundle') && 
                !m[1].includes('Entrypoint')) {
                author = m[1];
                break;
            }
        }
    }

    if (author === 'Facebook User') {
        // try title separators
        const separators = ['|', '·', ' - '];
        for (const sep of separators) {
            if (ogTitle.includes(sep)) {
                const parts = ogTitle.split(sep);
                if (parts.length >= 2) {
                    const possibleAuthor = parts[parts.length - 1].trim();
                    if (possibleAuthor && !possibleAuthor.toLowerCase().includes('facebook')) {
                        author = possibleAuthor;
                        break;
                    }
                }
            }
        }
    }

    // clean title
    let finalTitle = ogTitle;
    const cleanAuthor = author.toLowerCase();
    
    const separators = [' | ', ' · ', ' - '];
    for (const sep of separators) {
        if (finalTitle.includes(sep)) {
            const parts = finalTitle.split(sep);
            if (parts[parts.length - 1].toLowerCase().includes('facebook')) {
                parts.pop();
            }
            if (parts.length > 0 && parts[parts.length - 1].trim().toLowerCase() === cleanAuthor) {
                parts.pop();
            }
            finalTitle = parts.join(sep).trim();
        }
    }

    // fallback cleanup for title
    if (finalTitle.toLowerCase().endsWith(cleanAuthor)) {
        finalTitle = finalTitle.substring(0, finalTitle.length - cleanAuthor.length).trim();
    }

    // story title
    if (isStory && finalTitle === ogTitle && ogTitle.toLowerCase().includes('facebook')) {
        finalTitle = `Story by ${author}`;
    }

    return {
      id: targetUrl.match(/(?:v=|videos\/|reel\/|reels\/|share\/r\/|stories\/)([a-zA-Z0-9_-]+)/)?.[1] || 'fb_video',
      extractor_key: 'facebook',
      is_js_info: true,
      title: finalTitle || ogTitle,
      uploader: author,
      author: author,
      thumbnail: storyThumbnail || $('meta[property="og:image"]').attr('content'),
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
  
  const { getQuantumStream } = require('../../utils/proxy.util');
  return await getQuantumStream(format.url, { 'User-Agent': DESKTOP_UA, 'Referer': 'https://www.facebook.com/' });
}

module.exports = { getInfo, getStream };
