const youtube = require('./youtube');
const { isSupportedUrl } = require('../../utils/validation.util');

async function getExtractor(url) {
  if (!url) return null;
  
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return youtube;
  }
  
  // add extractors
  return null;
}

async function getInfo(url) {
  const extractor = await getExtractor(url);
  if (extractor) {
    try {
      return await extractor.getInfo(url);
    } catch (e) {
      console.warn(`[Extractor] JS Metadata failed for ${url}, falling back to yt-dlp:`, e.message);
      return null;
    }
  }
  return null;
}

// check resolution
function shouldJSStream(url, options = {}) {
  if (!url.includes('youtube.com') && !url.includes('youtu.be')) return false;
  
  const { quality = '720p', format = 'mp4' } = options;
  
  // audio only
  if (['mp3', 'm4a', 'audio'].includes(format)) return true;
  
  // basic quality
  const res = parseInt(quality);
  if (!isNaN(res) && res <= 720) return true;
  
  return false;
}

module.exports = {
  getInfo,
  shouldJSStream,
  youtube
};
