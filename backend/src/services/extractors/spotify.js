const youtube = require('./youtube');

// spotify js extractor
async function getInfo(url, options = {}) {
  const startTotal = Date.now();
  console.log(`[JS-Spotify] Starting Resolution: ${url}`);
  
  // break circular dep
  const spotifyService = require('../spotify/index');

  if (!spotifyService || typeof spotifyService.resolveSpotifyToYoutube !== 'function') {
     console.error('[JS-Spotify] Circular dependency error');
     throw new Error('Service initialization error.');
  }
  
  // resolve spotify track
  const startResolve = Date.now();
  const spotifyData = await spotifyService.resolveSpotifyToYoutube(url, [], (status, progress, extra) => {
    if (options.onProgress) options.onProgress(status, progress, extra);
  });
  const resolveTime = ((Date.now() - startResolve) / 1000).toFixed(2);

  if (!spotifyData || !spotifyData.targetUrl) {
    throw new Error('Failed to resolve Spotify track to YouTube.');
  }

  // check turso brain
  if (spotifyData.fromBrain && spotifyData.formats?.length > 0) {
    console.log(`[JS-Spotify] Registry Hit in ${resolveTime}s: ${spotifyData.title}`);
    const result = {
      ...spotifyData,
      cover: spotifyData.imageUrl || spotifyData.cover,
      thumbnail: spotifyData.imageUrl || spotifyData.thumbnail,
      target_url: spotifyData.targetUrl || spotifyData.youtubeUrl,
      duration: spotifyData.duration / 1000,
      extractor_key: 'spotify',
      is_spotify: true,
      is_js_info: true,
      fromBrain: true
    };
    result.targetUrl = result.target_url;
    return result;
  }

  console.log(`[JS-Spotify] Resolved in ${resolveTime}s -> ${spotifyData.targetUrl}`);

  // js info extraction
  const startJS = Date.now();
  const ytInfo = await youtube.getInfo(spotifyData.targetUrl);
  const jsTime = ((Date.now() - startJS) / 1000).toFixed(2);
  
  const totalTime = ((Date.now() - startTotal) / 1000).toFixed(2);
  console.log(`[JS-Spotify] PureJS Extraction [${jsTime}s] | Total Time: ${totalTime}s`);

  return {
    ...ytInfo,
    id: ytInfo.id,
    isrc: spotifyData.isrc || null,
    extractor_key: 'spotify',
    title: spotifyData.title || ytInfo.title,
    artist: spotifyData.artist || ytInfo.author,
    uploader: spotifyData.artist || ytInfo.author,
    album: spotifyData.album || '',
    imageUrl: spotifyData.cover || spotifyData.imageUrl || ytInfo.thumbnail,
    cover: spotifyData.cover || spotifyData.imageUrl || ytInfo.thumbnail,
    thumbnail: spotifyData.cover || spotifyData.imageUrl || ytInfo.thumbnail,
    previewUrl: spotifyData.previewUrl || null,
    webpage_url: url,
    target_url: spotifyData.targetUrl,
    targetUrl: spotifyData.targetUrl,
    is_spotify: true,
    is_js_info: true
  };
}

// refresh live session
async function getStream(videoInfo, options = {}) {
  // refresh expired urls
  if (videoInfo.fromBrain || !videoInfo.original_info) {
    console.log(`[JS-Spotify] Refreshing live YouTube session for stream...`);
    const liveYtInfo = await youtube.getInfo(videoInfo.target_url || videoInfo.targetUrl);
    return youtube.getStream(liveYtInfo, options);
  }
  return youtube.getStream(videoInfo, options);
}

module.exports = {
  getInfo,
  getStream
};
