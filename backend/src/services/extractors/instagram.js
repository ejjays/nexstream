const axios = require('axios');

const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

async function getInfo(url) {
  try {
    const shortcode = url.split('/p/')[1]?.split('/')[0] || url.split('/reel/')[1]?.split('/')[0] || url.split('/reels/')[1]?.split('/')[0];
    if (!shortcode) return null;

    // 1. OEmbed is very reliable for basic metadata
    const oembedUrl = `https://www.instagram.com/api/v1/oembed/?url=https://www.instagram.com/p/${shortcode}/`;
    const oembedRes = await axios.get(oembedUrl, {
      headers: { 'User-Agent': MOBILE_UA },
      timeout: 5000
    }).catch(() => null);

    if (!oembedRes?.data) return null;

    const data = oembedRes.data;

    // 2. We have metadata, now we need the video URL. 
    // Since direct API calls are 403-ing, we return the metadata and 
    // let the system fall back to yt-dlp for the heavy lifting if formats are empty.
    // However, we can try one more thing: ddinstagram/rapidapi if we had keys.
    // For now, let's provide clean metadata to unlock the picker.

    return {
      id: shortcode,
      title: data.title?.split('\n')[0].substring(0, 100) || 'Instagram Video',
      uploader: data.author_name || 'Instagram User',
      thumbnail: data.thumbnail_url,
      webpage_url: url,
      formats: [], // Empty formats array will trigger yt-dlp fallback for the stream
      isPartial: true
    };
  } catch (err) {
    console.error('[InstagramExtractor] Error:', err.message);
    return null;
  }
}

module.exports = { getInfo };
