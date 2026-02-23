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
  if (isSpotifyRequest && artist) displayTitle = `${artist} — ${displayTitle}`;
  const sanitized =
    displayTitle.replaceAll(/[<>:"/\\|?*]/g, "").trim() || "video";
  return `${sanitized}.${format}`;
}

module.exports = {
  detectService,
  getCookieType,
  getSanitizedFilename,
};
