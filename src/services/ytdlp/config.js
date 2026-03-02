const path = require("node:path");

const TEMP_DIR = path.join(__dirname, "../../../temp");
const CACHE_DIR = path.join(TEMP_DIR, "yt-dlp-cache");

const COMMON_ARGS = [
  "--ignore-config",
  "--no-playlist",
  "--remote-components",
  "ejs:github",
  "--force-ipv4",
  "--no-check-certificates",
  "--no-check-formats",
  "--no-warnings",
  "--socket-timeout",
  "30",
  "--retries",
  "3",
  "--no-colors",
];
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";

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
