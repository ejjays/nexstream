import { downloadImageToBuffer } from "./ytdlp.service.js";
import { fetchMetadata } from "../utils/metadata.util.js";

export interface RawSocialData {
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
  metascraper?: {
    author?: string | null;
    title?: string | null;
    image?: string | null;
    publisher?: string | null;
    description?: string | null;
    url?: string | null;
    logo?: string | null;
  } | null;
  [key: string]: unknown;
}

function applySmartFallback(info: RawSocialData): string {
  if (info === null || typeof info !== 'object') {
    return '';
  }
  const { title: rawTitle, alt_title, description } = info;
  const title = typeof rawTitle === 'string' ? rawTitle : '';

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
  // bypass long titles
  if (title.length > 300) return title.trim();

  let text = title;

  // clean whitespace
  text = text
    .replace(/\\n|\\r|\\t/g, " ")
    .replace(/\n|\r|\t/g, " ")
    .replace(/\s+/g, " ");
  
  if (author && text.includes(author)) {
    text = text.replace(new RegExp(`^${author}\\s*[:-|·•]\\s*`, 'i'), '');
    text = text.replace(new RegExp(`\\s*[:-|·•]\\s*${author}$`, 'i'), '');
  }

  // strip system prefix
  text = text.replace(/^(?:Reel|Video)\s+by\s+.*?\s*[|·•:-]\s*/i, '');

  // strip social metrics
  text = text.replace(
    /\d+(?:\.\d+)?[KkM]?\s*(?:na\s+)?(?:views?|reactions?|shares?|likes?|comments?|view|reaksyon|likes|heart|shares)\b/gi,
    "",
  );

  // clean separators
  text = text.replace(/[·•|:-]/g, " ").replace(/\s+/g, " ").trim();

  // strip short hashtags
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
  const title = info.metascraper?.title || info.title || '';
  
  // try metascraper fields
  let author = info.metascraper?.author || info.metascraper?.publisher;
  
  // extract from title
  if (!author || author.toLowerCase() === 'facebook' || author.toLowerCase() === 'instagram') {
    let guessedAuthor: string | undefined;

    if (title.includes('|')) {
      const parts = title.split('|').map(p => p.trim());
      // split FB title
      if (parts.length >= 3 && parts[parts.length - 1].toLowerCase() === 'facebook') {
        guessedAuthor = parts[parts.length - 2];
      } else if (parts.length >= 2) {
        guessedAuthor = parts[parts.length - 1];
      }
    } else if (title.includes('•')) {
      const parts = title.split('•').map(p => p.trim());
      if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1];
        if (lastPart.toLowerCase().includes('reel by')) {
            guessedAuthor = lastPart.split(/reel by/i).pop()?.trim();
        } else {
            guessedAuthor = lastPart.trim();
        }
      }
    } else if (title.toLowerCase().includes('reel by')) {
        guessedAuthor = title.split(/reel by/i).pop()?.trim();
    }

    // safety guards
    if (guessedAuthor) {
      const cleanGuess = guessedAuthor.toLowerCase();
      const isTooLong = guessedAuthor.length > 40;
      const isGeneric = cleanGuess === 'facebook' || cleanGuess === 'instagram' || cleanGuess.includes('log in');
      
      if (!isTooLong && !isGeneric) {
        author = guessedAuthor;
      }
    }
  }

  // fallback to ytdlp
  if (!author || author.toLowerCase() === 'facebook' || author.toLowerCase() === 'instagram') {
    author = info.uploader || info.artist || info.channel || info.creator || info.uploader_id;
  }

  if (author && typeof author === 'string' && author.toLowerCase() !== 'facebook' && author.toLowerCase() !== 'instagram') {
    return author;
  }

  if (info.webpage_url && typeof info.webpage_url === 'string') {
    const url = info.webpage_url.toLowerCase();
    if (url.includes('facebook.com') || url.includes('fb.watch')) return (author as string) || 'Facebook';
    if (url.includes('instagram.com')) return (author as string) || 'Instagram';
    if (url.includes('tiktok.com')) return (author as string) || 'TikTok';
    if (url.includes('twitter.com') || url.includes('x.com')) return (author as string) || 'X';
  }
  return (author as string) || 'Social Media';
};

export const normalizeTitle = (info: RawSocialData): string => {
  const author = normalizeArtist(info);
  
  // prefer metascraper title
  let rawTitle = info.metascraper?.title || applySmartFallback(info);

  // reduce SEO noise
  let finalTitle = rawTitle;
  if (info.metascraper?.title) {
    // split reel format
    if (finalTitle.includes('|')) {
        const parts = finalTitle.split('|').map(p => p.trim());
        // filter platform noise
        const filtered = parts.filter(p => {
            const clean = p.toLowerCase();
            return clean !== 'facebook' && 
                   clean !== 'instagram' && 
                   p.trim() !== author &&
                   !clean.includes('reel by') &&
                   !clean.includes('video by');
        });
        
        if (filtered.length > 0) {
            finalTitle = filtered[0]; // take first part
        }
    }
  }

  // apply purging rules
  if (finalTitle && finalTitle.length < 300) {
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
  
  // metascraper check
  if (info.metascraper?.image) return info.metascraper.image as string;

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
    } catch (proxyErr: unknown) {
      const error = proxyErr as Error;
      console.warn("[Proxy] Failed to proxy thumbnail:", error.message);
      return thumbnailUrl;
    }
  }
  return thumbnailUrl;
};
