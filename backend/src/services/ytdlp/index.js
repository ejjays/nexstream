const { COMMON_ARGS, CACHE_DIR } = require("./config");
const { downloadQueue } = require("../../utils/queue.util");
const { getVideoInfo, cacheVideoInfo, expandShortUrl } = require("./info");
const { streamDownload, spawnDownload } = require("./streamer");
const {
  downloadImage,
  downloadImageToBuffer,
  injectMetadata,
} = require("./processor");

// job worker
require('./worker');

module.exports = {
  getVideoInfo,
  spawnDownload,
  streamDownload,
  downloadImage,
  injectMetadata,
  downloadImageToBuffer,
  cacheVideoInfo,
  downloadQueue,
  expandShortUrl,
  COMMON_ARGS,
  CACHE_DIR,
};
