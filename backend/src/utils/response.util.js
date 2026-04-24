const { processVideoFormats, processAudioFormats } = require("./format.util");
const {
  normalizeTitle,
  normalizeArtist,
  getBestThumbnail,
  proxyThumbnailIfNeeded,
} = require("../services/social.service");

async function prepareFinalResponse(info, isSpotify, spotifyData, videoURL) {
  const finalTitle = normalizeTitle(info);
  const finalArtist = normalizeArtist(info);
  
  // Robust image recovery
  let spotifyImg = spotifyData?.imageUrl || spotifyData?.cover || spotifyData?.thumbnail || info?.imageUrl || info?.cover || info?.thumbnail;
  let finalThumbnail = getBestThumbnail(info);
  
  if (isSpotify && spotifyImg) {
    finalThumbnail = await proxyThumbnailIfNeeded(spotifyImg, videoURL);
  } else {
    finalThumbnail = await proxyThumbnailIfNeeded(finalThumbnail, videoURL);
  }

  // Preserve processed formats if already present (e.g. from cache)
  const formats = (info.formats && info.formats.length > 0 && info.formats[0].quality) 
    ? info.formats 
    : processVideoFormats(info);
    
  const audioFormats = (info.audioFormats && info.audioFormats.length > 0) 
    ? info.audioFormats 
    : processAudioFormats(info);

  return {
    title: isSpotify ? (spotifyData?.title || info.title) : finalTitle,
    artist: isSpotify ? (spotifyData?.artist || info.artist) : finalArtist,
    album: isSpotify ? (spotifyData?.album || info.album || "") : (info.album || ""),
    cover: finalThumbnail,
    thumbnail: finalThumbnail,
    duration: info.duration,
    previewUrl: isSpotify ? (spotifyData?.previewUrl || info.previewUrl) : null,
    formats: formats,
    audioFormats: audioFormats,
    spotifyMetadata: spotifyData || info.spotifyMetadata,
    isPartial: info.isPartial || info.is_partial || false,
    isrc: spotifyData?.isrc || info.isrc,
    isIsrcMatch: info.isIsrcMatch || false,
    webpage_url: videoURL
  };
}

function prepareBrainResponse(spotifyData) {
  return {
    title: spotifyData.title,
    artist: spotifyData.artist,
    album: spotifyData.album,
    cover: spotifyData.imageUrl || "/logo.webp",
    thumbnail: spotifyData.imageUrl || "/logo.webp",
    duration: spotifyData.duration / 1000,
    previewUrl: spotifyData.previewUrl,
    formats: spotifyData.formats,
    audioFormats: spotifyData.audioFormats,
    spotifyMetadata: spotifyData,
  };
}

function setupConvertResponse(res, filename, format, size = 0) {
  const mimeTypes = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    mp4: "video/mp4",
    opus: "audio/opus",
    ogg: "audio/ogg",
  };

  const safeName = encodeURIComponent(filename);
  const asciiName = filename.replaceAll(/[^\x20-\x7E]/g, '');
  
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiName.replaceAll('"', '')}"; filename*=UTF-8''${safeName}`,
  );
  res.setHeader(
    "Content-Type",
    mimeTypes[format] || "application/octet-stream",
  );

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
}

module.exports = {
  prepareFinalResponse,
  prepareBrainResponse,
  setupConvertResponse,
};
