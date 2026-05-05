import { VideoInfo } from '../types/index.js';
import { downloadImageToBuffer } from "./ytdlp.service.js";

function applySmartFallback(info: VideoInfo | any): string {
  let title = info.title;
  const author = info.uploader || info.artist || info.channel || info.creator;
  
  const isGeneric = !title || 
    title.toLowerCase() === "video" ||
    (title.startsWith("Video by") && title.length < 20) || 
    (title.startsWith("Reel by") && title.length < 20) ||
    title.toLowerCase() === "instagram" ||
    title.toLowerCase() === "facebook" ||
    (title.toLowerCase().includes("reactions") && title.length < 30) ||
    (title.toLowerCase().includes("views") && title.length < 30);

  if (isGeneric) {
    if (info.alt_title && info.alt_title.length > 3) return info.alt_title;

    if (info.description && info.description.trim()) {
      const firstLine = info.description.split("\n")[0].trim();
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

export const normalizeArtist = (info: VideoInfo | any): string => {
  const author = info.uploader || info.artist || info.channel || info.creator || info.uploader_id;
  if (author && author.toLowerCase() !== 'facebook' && author.toLowerCase() !== 'instagram') return author;

  if (info.webpage_url) {
    const url = info.webpage_url.toLowerCase();
    if (url.includes('facebook.com') || url.includes('fb.watch')) return author || 'Facebook User';
    if (url.includes('instagram.com')) return author || 'Instagram User';
    if (url.includes('tiktok.com')) return author || 'TikTok User';
    if (url.includes('twitter.com') || url.includes('x.com')) return author || 'X User';
  }
  return author || 'Unknown Author';
};

export const normalizeTitle = (info: VideoInfo | any): string => {
  const author = normalizeArtist(info);
  let finalTitle = applySmartFallback(info);

  if (finalTitle && finalTitle.length < 100) {
    finalTitle = purgeSocialMetadata(finalTitle, author);
  }

  if (!finalTitle || finalTitle.length < 2) {
    if (info.id) return `Video_${info.id}`;
    finalTitle = `Video_${Date.now()}`;
  }

  return finalTitle;
};

export const getBestThumbnail = (info: VideoInfo | any): string | undefined => {
  let finalThumbnail = info.thumbnail;
  if (!finalThumbnail && info.thumbnails && info.thumbnails.length > 0) {
    const best = info.thumbnails.reduce((prev: any, current: any) => {
      return (prev.width || 0) > (current.width || 0) ? prev : current;
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
    } catch (proxyErr: unknown) {
      console.warn("[Proxy] Failed to proxy thumbnail:", (proxyErr as Error).message);
      return thumbnailUrl;
    }
  }
  return thumbnailUrl;
};
