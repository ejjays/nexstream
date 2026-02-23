const ytdlp = require("./ytdlp/index");

module.exports = {
  getVideoInfo: ytdlp.getVideoInfo,
  spawnDownload: ytdlp.spawnDownload,
  streamDownload: ytdlp.streamDownload,
  downloadImage: ytdlp.downloadImage,
  injectMetadata: ytdlp.injectMetadata,
  downloadImageToBuffer: ytdlp.downloadImageToBuffer,
  cacheVideoInfo: ytdlp.cacheVideoInfo,
  acquireLock: ytdlp.acquireLock,
  releaseLock: ytdlp.releaseLock,
  COMMON_ARGS: ytdlp.COMMON_ARGS,
  CACHE_DIR: ytdlp.CACHE_DIR,
};
