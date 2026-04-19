const path = require("node:path");

const TEMP_DIR = path.join(__dirname, "../../../temp");
const CACHE_DIR = path.join(TEMP_DIR, "yt-dlp-cache");

const COMMON_ARGS = [
  "--ignore-config",
  "--no-playlist",
  "--force-ipv4",
  "--no-check-certificates",
  "--no-check-formats",
  "--no-warnings",
  "--socket-timeout",
  "15",
  "--retries",
  "10",
  "--fragment-retries",
  "10",
  "--buffer-size",
  "1M",
  "--http-chunk-size",
  "10M",
  "--no-colors",
  "--extractor-args",
  "youtube:player_client=android,ios,mweb,web_embedded;player_skip=web",
  "--format-sort",
  "res,vcodec,size",
  "--mark-watched"
];
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

const REFERER_MAP = {
  "facebook.com": "https://www.facebook.com/",
  "bilibili.com": "https://www.bilibili.com/",
  "x.com": "https://x.com/",
};

module.exports = {
  COMMON_ARGS,
  TEMP_DIR,
  CACHE_DIR,
  USER_AGENT,
  REFERER_MAP,
};
