import * as ytdlp from "./ytdlp/index.js";

export const getVideoInfo = ytdlp.getVideoInfo;
export const spawnDownload = ytdlp.spawnDownload;
export const streamDownload = ytdlp.streamDownload;
export const downloadImage = ytdlp.downloadImage;
export const injectMetadata = ytdlp.injectMetadata;
export const downloadImageToBuffer = ytdlp.downloadImageToBuffer;
export const cacheVideoInfo = ytdlp.cacheVideoInfo;
export const acquireLock = ytdlp.acquireLock;
export const releaseLock = ytdlp.releaseLock;
export const COMMON_ARGS = ytdlp.COMMON_ARGS;
export const CACHE_DIR = ytdlp.CACHE_DIR;
