const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

async function getInfo(url) {
  try {
    const shortcode = url.split('/p/')[1]?.split('/')[0] || 
                      url.split('/reel/')[1]?.split('/')[0] || 
                      url.split('/reels/')[1]?.split('/')[0];
    if (!shortcode) return null;

    // scrape embed page
    try {
      const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
      const res = await fetch(embedUrl, {
        headers: { 'User-Agent': MOBILE_UA },
        signal: AbortSignal.timeout(10000)
      });
      
      if (res.ok) {
        const html = await res.text();
        const videoMatch = html.match(/"video_url":"([^"]+)"/) || html.match(/\\\"video_url\\\":\\\"(.*?)\\\"/);
        if (videoMatch) {
          const videoUrl = videoMatch[1].replace(/\\u0026/g, '&').replace(/\\\\u0026/g, '&');
          
          return {
            id: shortcode,
            title: 'Instagram Video',
            uploader: 'Instagram User',
            thumbnail: null,
            webpage_url: url,
            formats: [{
              format_id: 'best',
              url: videoUrl,
              ext: 'mp4',
              is_video: true,
              is_audio: true
            }]
          };
        }
      }
    } catch (e) {}

    // fallback to ytdlp
    console.log('[JS-IG] No stream found, falling back to yt-dlp');
    return null;
  } catch (err) {
    return null;
  }
}

async function getStream(videoInfo, options = {}) {
  const format = videoInfo.formats?.[0];
  if (!format || !format.url) throw new Error('No stream URL found');
  const { Readable } = require('node:stream');
  const response = await fetch(format.url, {
    headers: { 'User-Agent': MOBILE_UA, 'Referer': 'https://www.instagram.com/' }
  });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return Readable.fromWeb(response.body);
}

module.exports = { getInfo, getStream };
