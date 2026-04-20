const youtube = require('./youtube');
const instagram = require('./instagram');
const facebook = require('./facebook');
const tiktok = require('./tiktok');
const spotify = require('./spotify');
const { isSupportedUrl } = require('../../utils/validation.util');

async function getExtractor(url) {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return youtube;
  if (url.includes('instagram.com')) return instagram;
  if (url.includes('facebook.com') || url.includes('fb.watch')) return facebook;
  if (url.includes('tiktok.com')) return tiktok;
  if (url.includes('spotify.com')) return spotify;
  return null;
}

async function getInfo(url, options = {}) {
  const extractor = await getExtractor(url);
  if (!extractor) return null;
  return await extractor.getInfo(url, options);
}

function shouldJSStream(url, quality, format) {
  // force ytdlp high res
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
     return false; 
  }

  // allow direct pipe for social reels
  if (url.includes('facebook.com') || url.includes('instagram.com') || url.includes('tiktok.com') || url.includes('spotify.com')) return true;

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
  facebook,
  tiktok,
  spotify
};
