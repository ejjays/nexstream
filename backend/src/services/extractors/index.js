const youtube = require('./youtube');
const instagram = require('./instagram');
const facebook = require('./facebook');
const { isSupportedUrl } = require('../../utils/validation.util');

async function getExtractor(url) {
  if (!url) return null;
  
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return youtube;
  }
  
  if (url.includes('instagram.com')) {
    return instagram;
  }
  
  if (url.includes('facebook.com') || url.includes('fb.watch')) {
    return facebook;
  }
  
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
function shouldJSStream(url, options = {}, info = null) {
  const isJSPlatform = url.includes('youtube.com') || 
                       url.includes('youtu.be') || 
                       url.includes('instagram.com') ||
                       url.includes('facebook.com') ||
                       url.includes('fb.watch');
                       
  if (!isJSPlatform) return false;
  
  // check format availability
  if (url.includes('instagram.com') || url.includes('facebook.com') || url.includes('fb.watch')) {
    return !!(info && info.formats && info.formats.length > 0);
  }
  
  const { quality = '720p', format = 'mp4' } = options;
  
  // allow audio
  if (['mp3', 'm4a', 'audio'].includes(format)) return true;
  
  // allow low res
  const res = parseInt(quality);
  if (!isNaN(res) && res <= 720) return true;
  
  return false;
}

module.exports = {
  getInfo,
  shouldJSStream,
  youtube,
  instagram,
  facebook
};
