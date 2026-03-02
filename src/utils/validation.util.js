const { URL } = require("node:url");

const SUPPORTED_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "spotify.com",
  "open.spotify.com",
  "facebook.com",
  "fb.watch",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "soundcloud.com",
  "reddit.com",
];

function isSupportedUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return SUPPORTED_DOMAINS.some(
      (domain) =>
        parsed.hostname === domain || parsed.hostname.endsWith("." + domain),
    );
  } catch {
    return false;
  }
}

function isValidSpotifyUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "open.spotify.com" ||
      parsed.hostname === "spotify.com"
    );
  } catch {
    return false;
  }
}

function extractTrackId(url) {
  if (!isValidSpotifyUrl(url)) return null;
  const match = url.match(/\/track\/([a-zA-Z0-9]{22})/);
  return match ? match[1] : null;
}

const PROXY_ALLOWED_DOMAINS = [
  'googlevideo.com',
  'youtube.com',
  'youtu.be',
  'spotifycdn.com',
  'soundcharts.com',
  'i.scdn.co',
  'fbcdn.net',
  'instagram.com',
  'akamaihd.net'
];

function isValidProxyUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return PROXY_ALLOWED_DOMAINS.some(
      domain =>
        parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

module.exports = {
  isSupportedUrl,
  isValidSpotifyUrl,
  extractTrackId,
  isValidProxyUrl
};
