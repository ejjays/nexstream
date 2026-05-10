import { VideoInfo } from '../types/index.js';
import { downloadImageToBuffer } from "./ytdlp.service.js";

interface RawSocialData {
  title?: string;
  uploader?: string;
  artist?: string;
  channel?: string;
  creator?: string;
  alt_title?: string;
  description?: string;
  uploader_id?: string;
  webpage_url?: string;
  id?: string;
  thumbnail?: string;
  thumbnails?: Array<{ width?: number; url: string }>;
  [key: string]: unknown;
}

function applySmartFallback(info: RawSocialData): string {
  if (info === null || typeof info !== 'object') {
    return '';
  }
  const { title: rawTitle, uploader, artist, channel, creator, alt_title, description } = info;
  const title = typeof rawTitle === 'string' ? rawTitle : '';
  const author = typeof uploader === 'string'
    ? uploader
    : typeof artist === 'string'
    ? artist
    : typeof channel === 'string'
    ? channel
    : typeof creator === 'string'
    ? creator
    : undefined;

  const isGeneric = !title ||
    title.toLowerCase() === "video" ||
    (title.startsWith("Video by") && title.length < 20) ||
    (title.startsWith("Reel by") && title.length < 20) ||
    title.toLowerCase() === "instagram" ||
    title.toLowerCase() === "facebook" ||
    (title.toLowerCase().includes("reactions") && title.length < 30) ||
    (title.toLowerCase().includes("views") && title.length < 30);

  if (isGeneric) {
    if (typeof alt_title === 'string' && alt_title.length > 3) return alt_title;

    if (typeof description === 'string' && description.trim()) {
      const firstLine = description.split("\n")[0].trim();
      if (firstLine && firstLine.length > 3) {
        return firstLine.substring(0, 300).trim();
      }
    }
  }
  return title;
}

function purgeSocialMetadata(title: string, author: string | undefined): string {
  // bypass for long descriptive titles (captions)
  if (title.length > 100) return title.trim();

  let text = title;

  // sanitize whitespace
  text = text
    .replace(/\\n|\\r|\\t/g, " ")
    .replace(/\n|\r|\t/g, " ")
    .replace(/\s+/g, " ");
  
  if (author && text.includes(author)) {
    text = text.replace(new RegExp(`^${author}\\s*[:-|·•]\\s*`, 'i'), '');
    text = text.replace(new RegExp(`\\s*[:-|·•]\\s*${author}$`, 'i'), '');
  }

  // strip common system prefixes
  text = text.replace(/^(?:Reel|Video)\s+by\s+.*?\s*[|·•:-]\s*/i, '');

  // strip view counts
  text = text.replace(
    /\d+(?:\.\d+)?[KkM]?\s*(?:na\s+)?(?:views?|reactions?|shares?|likes?|comments?|view|reaksyon|likes|heart|shares)\b/gi,
    "",
  );

  // cleanup separators
  text = text.replace(/[·•|:-]/g, " ").replace(/\s+/g, " ").trim();

  // strip hashtags only if short
  if (text.length < 100) {
    text = text.replace(/#\w+/g, "");
  }

  if (text.includes("|") && text.length < 100) {
    const parts = text.split("|");
    const bestPart = parts.find(p => p.trim().length > 5) || parts[0];
    text = bestPart.trim();
  }

  return text.trim();
}

export const normalizeArtist = (info: RawSocialData): string => {
  const author = info.uploader || info.artist || info.channel || info.creator || info.uploader_id;
  if (author && typeof author === 'string' && author.toLowerCase() !== 'facebook' && author.toLowerCase() !== 'instagram') return author;

  if (info.webpage_url && typeof info.webpage_url === 'string') {
    const url = info.webpage_url.toLowerCase();
    if (url.includes('facebook.com') || url.includes('fb.watch')) return (author as string) || 'Facebook User';
    if (url.includes('instagram.com')) return (author as string) || 'Instagram User';
    if (url.includes('tiktok.com')) return (author as string) || 'TikTok User';
    if (url.includes('twitter.com') || url.includes('x.com')) return (author as string) || 'X User';
  }
  return (author as string) || 'Unknown Author';
};

export const normalizeTitle = (info: RawSocialData): string => {
  const author = normalizeArtist(info);
  let finalTitle = applySmartFallback(info);

  if (finalTitle && finalTitle.length < 100) {
    finalTitle = purgeSocialMetadata(finalTitle, author);
  }

  if (!finalTitle || finalTitle.length < 2) {
    if (info.id && typeof info.id === 'string') return `Video_${info.id}`;
    finalTitle = `Video_${Date.now()}`;
  }

  return finalTitle;
};

export const getBestThumbnail = (info: RawSocialData): string | undefined => {
  if (typeof info !== 'object' || info === null) {
    return undefined;
  }
  let finalThumbnail = info.thumbnail;
  const thumbnails = info.thumbnails;
  if (!finalThumbnail && Array.isArray(thumbnails) && thumbnails.length > 0) {
    const best = thumbnails.reduce((prev, current) => {
      const prevWidth = prev.width ?? 0;
      const currWidth = current.width ?? 0;
      return prevWidth > currWidth ? prev : current;
    });
    finalThumbnail = best.url;
  }
  return finalThumbnail;
};

export const proxyThumbnailIfNeeded = async (thumbnailUrl: string | undefined, videoUrl: string): Promise<string | undefined> => {
  if (!thumbnailUrl || thumbnailUrl.startsWith("data:")) return thumbnailUrl;

  const isPermanentDomain =
    thumbnailUrl.includes("i.scdn.co") ||
    thumbnailUrl.includes("spotifycdn.com") ||
    thumbnailUrl.includes("ytimg.com") ||
    thumbnailUrl.includes("googleusercontent.com") ||
    thumbnailUrl.includes("ggpht.com");

  if (isPermanentDomain) {
    return thumbnailUrl;
  }

  const needsProxy =
    videoUrl.includes("instagram.com") ||
    videoUrl.includes("facebook.com") ||
    videoUrl.includes("tiktok.com");

  if (needsProxy) {
    try {
      const imgBuffer = await downloadImageToBuffer(thumbnailUrl);
      const base64Img = imgBuffer.toString("base64");
      const extension = thumbnailUrl.split(".").pop()?.split("?")[0] || "jpeg";
      const mimeType = extension === "png" ? "image/png" : "image/jpeg";

      console.log(
        `[Proxy] Volatile platform detected. Storing as Base64 (${mimeType})`,
      );
      return `data:${mimeType};base64,${base64Img}`;
    } catch (proxyErr: any) {
      console.warn("[Proxy] Failed to proxy thumbnail:", proxyErr.message);
      return thumbnailUrl;
    }
  }
  return thumbnailUrl;
};
