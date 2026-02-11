const { downloadImageToBuffer } = require('./ytdlp.service');

function applySmartFallback(info) {
  let title = info.title;
  if (
    !title ||
    title.startsWith('Video by') ||
    title.startsWith('Reel by') ||
    title.toLowerCase() === 'instagram' ||
    title.toLowerCase().includes('reactions') ||
    title.toLowerCase().includes('views')
  ) {
    if (info.description) {
      title = info.description.split('\n')[0].substring(0, 80).trim(); 
    }
  }
  return title;
}

function purgeSocialMetadata(title) {
  let text = title;
  // Remove "1.2k views", "300 reactions", etc.
  text = text.replace(/\d+(?:\.\d+)?[KkM]?\s+(?:views|reactions|shares|likes)\b/gi, '');
  
  // Remove hashtags
  text = text.replace(/#\w+/g, '');

  // Handle common Facebook separator "|"
  if (text.includes('|')) {
    const parts = text.split('|');
    text = parts[parts.length - 1].trim();
  }

  // Handle common separator " - "
  if (text.includes(' - ')) {
    const parts = text.split(' - ');
    if (parts[1].length < 15) text = parts[0].trim();
  }

  // Final clean up of extra spaces/dashes - non-overlapping groups
  return text.replace(/^[\s\-|]+/, '').replace(/[\s\-|]+$/, '').trim();
}

/**
 * Smart fallback for titles (e.g., removing generic "Video by..." titles from IG/FB).
 */
exports.normalizeTitle = (info) => {
  let finalTitle = applySmartFallback(info);
  
  if (finalTitle) {
    finalTitle = purgeSocialMetadata(finalTitle);
  }

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
 * Proxies an image URL to a Base64 string to avoid CORS/403/Referer errors.
 * Critical for IG/FB and some Spotify/YouTube high-res thumbnails.
 */
exports.proxyThumbnailIfNeeded = async (thumbnailUrl, videoUrl) => {
  if (!thumbnailUrl || thumbnailUrl.startsWith('data:')) return thumbnailUrl;

  const needsProxy = 
    videoUrl.includes('instagram.com') || 
    videoUrl.includes('facebook.com') || 
    videoUrl.includes('spotify.com') || 
    videoUrl.includes('youtube.com') || 
    videoUrl.includes('youtu.be');

  if (needsProxy) {
    try {
      const imgBuffer = await downloadImageToBuffer(thumbnailUrl);
      const base64Img = imgBuffer.toString('base64');
      // Detect mime type from URL or default to jpeg
      const extension = thumbnailUrl.split('.').pop().split('?')[0] || 'jpeg';
      const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
      
      console.log(`[Proxy] Successfully base64-encoded thumbnail (${mimeType})`);
      return `data:${mimeType};base64,${base64Img}`;
    } catch (proxyErr) {
      console.warn('[Proxy] Failed to proxy thumbnail:', proxyErr.message);
      return thumbnailUrl; // Fallback to original URL
    }
  }
  return thumbnailUrl;
};
