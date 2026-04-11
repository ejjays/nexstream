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
  "64k",
  "--no-colors",
  "--extractor-args",
  "youtube:player_client=ios;player_skip=web,web_embedded,android",
  "--mark-watched"
];
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

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
