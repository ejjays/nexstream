const { downloadImageToBuffer } = require('./ytdlp.service');

/**
 * Smart fallback for titles (e.g., removing generic "Video by..." titles from IG/FB).
 */
exports.normalizeTitle = (info) => {
  let finalTitle = info.title;
  
  if (
    !finalTitle ||
    finalTitle.startsWith('Video by') ||
    finalTitle.startsWith('Reel by') ||
    finalTitle.toLowerCase() === 'instagram'
  ) {
    if (info.description) {
      finalTitle = info.description.split('\n')[0].substring(0, 60).trim(); // Use caption
    } else {
      finalTitle = `Video_${Date.now()}`;
    }
  }
  return finalTitle;
};

/**
 * Finds the highest resolution thumbnail from the available list.
 */
exports.getBestThumbnail = (info) => {
  let finalThumbnail = info.thumbnail;
  if (!finalThumbnail && info.thumbnails && info.thumbnails.length > 0) {
    // Find biggest width
    const best = info.thumbnails.reduce((prev, current) => {
      return (prev.width || 0) > (current.width || 0) ? prev : current;
    });
    finalThumbnail = best.url;
  }
  return finalThumbnail;
};

/**
 * Proxies an image URL to a Base64 string to avoid CORS/403 errors (common with IG/FB).
 */
exports.proxyThumbnailIfNeeded = async (thumbnailUrl, videoUrl) => {
  if (
    thumbnailUrl &&
    (videoUrl.includes('instagram.com') || videoUrl.includes('facebook.com'))
  ) {
    try {
      const imgBuffer = await downloadImageToBuffer(thumbnailUrl);
      const base64Img = imgBuffer.toString('base64');
      console.log('[Proxy] Successfully converted thumbnail to Base64');
      return `data:image/jpeg;base64,${base64Img}`;
    } catch (proxyErr) {
      console.warn('[Proxy] Failed to proxy thumbnail:', proxyErr.message);
      return thumbnailUrl; // Fallback to original URL
    }
  }
  return thumbnailUrl;
};
