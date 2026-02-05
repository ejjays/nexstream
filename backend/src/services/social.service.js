const { downloadImageToBuffer } = require('./ytdlp.service');

/**
 * Smart fallback for titles (e.g., removing generic "Video by..." titles from IG/FB).
 */
exports.normalizeTitle = (info) => {
  let finalTitle = info.title;
  
  // 1. Handle Facebook/Instagram generic/cluttered titles
  if (
    !finalTitle ||
    finalTitle.startsWith('Video by') ||
    finalTitle.startsWith('Reel by') ||
    finalTitle.toLowerCase() === 'instagram' ||
    finalTitle.toLowerCase().includes('reactions') ||
    finalTitle.toLowerCase().includes('views')
  ) {
    if (info.description) {
      // Prioritize description if title is generic or social-cluttered
      finalTitle = info.description.split('\n')[0].substring(0, 80).trim(); 
    }
  }

  // 2. SOCIAL METADATA PURGE (Regex)
  if (finalTitle) {
    // Remove "1.2k views", "300 reactions", etc.
    finalTitle = finalTitle.replace(/\d+(\.\d+)?[KkM]?\s+(views|reactions|shares|likes)\b/gi, '');
    
    // Remove hashtags
    finalTitle = finalTitle.replace(/#\w+/g, '');

    // Handle common Facebook separator "|"
    if (finalTitle.includes('|')) {
      const parts = finalTitle.split('|');
      // If the part after "|" is longer or looks more like a title, take it
      finalTitle = parts[parts.length - 1].trim();
    }

    // Handle common separator " - "
    if (finalTitle.includes(' - ')) {
      const parts = finalTitle.split(' - ');
      // Usually the first part is the title if the second part is short
      if (parts[1].length < 15) finalTitle = parts[0].trim();
    }

    // Final clean up of extra spaces/dashes
    finalTitle = finalTitle.replace(/^[-\s|]+|[-\s|]+$/g, '').trim();
  }

  // 3. Fallback
  if (!finalTitle || finalTitle.length < 2) {
    finalTitle = `Video_${Date.now()}`;
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
