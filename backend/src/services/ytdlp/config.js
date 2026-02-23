const path = require("node:path");

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

const CACHE_DIR = path.join(__dirname, "../../../temp/yt-dlp-cache");
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const REFERER_MAP = {
  "facebook.com": "https://www.facebook.com/",
  "bilibili.com": "https://www.bilibili.com/",
  "x.com": "https://x.com/",
};

module.exports = {
  COMMON_ARGS,
  CACHE_DIR,
  USER_AGENT,
  REFERER_MAP,
};
