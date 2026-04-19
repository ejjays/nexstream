const cheerio = require('cheerio');

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

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

async function getInfo(url, options = {}) {
  try {
    const shortcode = url.split('/p/')[1]?.split('/')[0] || 
                      url.split('/reel/')[1]?.split('/')[0] || 
                      url.split('/reels/')[1]?.split('/')[0];
    
    if (!shortcode) return null;
    console.log(`[JS-IG] info: ${shortcode}`);

    const formats = [];
    let title = '';
    let author = 'Instagram User';
    let thumbnail = null;

    // try oembed api
    try {
        const oembedUrl = `https://api.instagram.com/oembed/?url=https://www.instagram.com/p/${shortcode}/`;
        const ores = await fetch(oembedUrl, { headers: HEADERS });
        if (ores.ok) {
            const odata = await ores.json();
            title = odata.title;
            author = odata.author_name || author;
            thumbnail = odata.thumbnail_url || thumbnail;
        }
    } catch (e) {}

    // try embed page
    try {
      const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
      const res = await fetch(embedUrl, {
        headers: HEADERS,
        signal: AbortSignal.timeout(10000)
      });
      
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        
        // match video url
        const videoMatch = html.match(/"video_url":"([^"]+)"/) || html.match(/\\\"video_url\\\":\\\"(.*?)\\\"/);
        if (videoMatch) {
            let videoUrl = videoMatch[1]
                .replace(/\\u0026/g, '&')
                .replace(/\\\\u0026/g, '&')
                .replace(/\\/g, '');
            
            formats.push({
                format_id: 'best',
                url: videoUrl,
                ext: 'mp4',
                resolution: '720p (HD)',
                is_muxed: true,
                is_video: true,
                is_audio: true
            });
        }

        // extract metadata
        const embedAuthor = $('.UsernameText').text().trim();
        if (embedAuthor) author = embedAuthor;
        
        // search script caption
        const captionMatch = html.match(/\\"caption\\":\\"(.*?)\\"/) || html.match(/"caption":"([^"]+)"/);
        let scriptCaption = '';
        if (captionMatch) {
            scriptCaption = captionMatch[1]
                .replace(/\\\\n/g, ' ')
                .replace(/\\n/g, ' ')
                .replace(/\\"/g, '"');
        }

        const possibleTitles = [
            scriptCaption,
            $('.CaptionText').text().trim(),
            $('meta[property="og:title"]').attr('content'),
            $('link[rel="alternate"][title]').attr('title')
        ].filter(t => t && t !== 'Instagram Video');

        if (possibleTitles.length > 0) {
            title = possibleTitles.reduce((a, b) => a.length > b.length ? a : b);
        }

        if (!thumbnail) {
            thumbnail = $('meta[property="og:image"]').attr('content') || $('.EmbeddedMediaImage').attr('src');
        }
      }
    } catch (e) {}

    if (formats.length === 0) return null;

    // clean title
    if (title) {
        title = title.split(' | ')[0].trim();
        title = title.split(' • ')[0].trim();
        title = title.split(' \u00b7 ')[0].trim();
        title = title.replace(/\\\/|\\\\\/|\\\\\\\/|\\/g, (match) => {
            if (match.includes('/')) return '/';
            return match;
        });
    }

    // get file sizes
    await Promise.all(formats.map(async f => {
        try {
          const hRes = await fetch(f.url, { 
              method: 'HEAD', 
              headers: { 'User-Agent': MOBILE_UA },
              signal: AbortSignal.timeout(2000) 
          });
          const len = hRes.headers.get('content-length');
          if (len) f.filesize = parseInt(len);
        } catch (e) {}
    }));

    return {
      id: shortcode,
      extractor_key: 'instagram',
      is_js_info: true,
      title: title || 'Instagram Video',
      uploader: author || 'Instagram User',
      author: author || 'Instagram User',
      thumbnail: thumbnail,
      webpage_url: url,
      formats: formats
    };
  } catch (err) {
    console.error(`[JS-IG] Error: ${err.message}`);
    return null;
  }
}

async function getStream(videoInfo, options = {}) {
  const format = videoInfo.formats.find(f => String(f.format_id) === String(options.formatId)) || videoInfo.formats?.[0];
  if (!format || !format.url) throw new Error('No stream URL found');
  
  const { getQuantumStream } = require('../../utils/proxy.util');
  return await getQuantumStream(format.url, { 'User-Agent': MOBILE_UA, 'Referer': 'https://www.instagram.com/' });
}

module.exports = { getInfo, getStream };
