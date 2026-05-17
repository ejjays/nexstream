export function detectService(url: string): string {
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

export function getCookieType(url: string): "facebook" | "youtube" | null {
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

export function getSanitizedFilename(
  title: string, 
  artist: string | undefined, 
  format: string, 
  isSpotifyRequest: boolean
): string {
  let displayTitle = title;
  
  if (isSpotifyRequest && artist) {
    displayTitle = `${artist} - ${displayTitle}`;
  }

  // clean punctuation
  let sanitized = displayTitle
    .replace(/[<>:"/u\\|?*]/g, "") // illegal fs chars
    .replace(/[\r\n\t]/gu, " ")    // newlines
    .replace(/\s+/gu, " ")        // collapse spaces
    .trim();

  // truncate titles
  const MAX_LENGTH = 64;
  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.substring(0, MAX_LENGTH).trim() + "...";
  }

  return `${sanitized || "video"}.${format}`;
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const paramsToDelete = ['si', 'id', 'feature', 'context', 'fbclid', 'rdid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    paramsToDelete.forEach(p => parsed.searchParams.delete(p));
    
    let result = parsed.toString();
    if (result.endsWith('?')) result = result.slice(0, -1);
    return result;
  } catch {
    return url;
  }
}
