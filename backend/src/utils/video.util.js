function detectService(url) {
  if (url.includes("spotify.com")) return "Spotify Music";
  if (url.includes("facebook.com") || url.includes("fb.watch"))
    return "Facebook";
  if (url.includes("instagram.com")) return "Instagram";
  if (url.includes("tiktok.com")) return "TikTok";
  if (url.includes("twitter.com") || url.includes("x.com"))
    return "X (Twitter)";
  if (url.includes("soundcloud.com")) return "SoundCloud";
  if (url.includes("reddit.com")) return "Reddit";
  return "YouTube";
}

function getCookieType(url) {
  if (url.includes("facebook.com") || url.includes("fb.watch"))
    return "facebook";
  if (url.includes("instagram.com"))
    return "facebook"; 
  if (
    url.includes("youtube.com") ||
    url.includes("youtu.be") ||
    url.includes("spotify.com")
  )
    return "youtube";
  return null;
}

function getSanitizedFilename(title, artist, format, isSpotifyRequest) {
  let displayTitle = title;
  
  if (isSpotifyRequest && artist) {
    displayTitle = `${artist} - ${displayTitle}`;
  }

  // clean complex punctuation and emojis
  let sanitized = displayTitle
    .replace(/[<>:"/\\|?*]/g, "") // illegal fs chars
    .replace(/[\n\r\t]/g, " ")    // newlines
    .replace(/\s+/g, " ")        // collapse spaces
    .trim();

  // truncate very long titles
  const MAX_LENGTH = 64;
  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.substring(0, MAX_LENGTH).trim() + "...";
  }

  return `${sanitized || "video"}.${format}`;
}

module.exports = {
  detectService,
  getCookieType,
  getSanitizedFilename,
};
