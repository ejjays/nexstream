import { downloadImageToBuffer } from "./ytdlp.service.js";

export interface RawSocialData {
  title?: string;
  uploader?: string;
  artist?: string;
  channel?: string;
  creator?: string;
  alt_title?: string;
  description?: string;
  uploader_id?: string;
  webpageUrl?: string;
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

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function purgeSocialMetadata(title: string, author: string | undefined): string {
  // bypass long titles
  if (title.length > 300) return title.trim();

  let text = title;

  // clean whitespace
  text = text
    .replace(/\\n|\\r|\\t/gu, " ")
    .replace(/\n|\r|\t/gu, " ")
    .replace(/\s+/gu, " ");
  
  if (author && text.includes(author)) {
    const escapedAuthor = escapeRegExp(author);
    text = text.replace(new RegExp(`^${escapedAuthor}\\s*[:-|·•]\\s*`, 'ui'), '');
    text = text.replace(new RegExp(`\\s*[:-|·•]\\s*${escapedAuthor}$`, 'ui'), '');
  }

  // strip system prefix
  text = text.replace(/^(?:Reel|Video)\s+by\s+.*?\s*[|·•:-]\s*/ui, '');

  // strip social metrics
  text = text.replace(
    /\d+(?:\.\d+)?[KkM]?\s*(?:na\s+)?(?:views?|reactions?|shares?|likes?|comments?|view|reaksyon|likes|heart|shares)\b/ugi,
    "",
  );

  // clean separators
  text = text.replace(/[·•|:-]/ug, " ").replace(/\s+/ug, " ").trim();

  // strip short hashtags
  if (text.length < 100) {
    text = text.replace(/#\w+/ug, "");
  }

  if (text.includes("|") && text.length < 100) {
    const parts = text.split("|");
    const bestPart = parts.find(p => p.trim().length > 5) || parts[0];
    text = bestPart.trim();
  }

  return text.trim();
}

function guessAuthorFromTitle(title: string): string | undefined {
  let guessedAuthor: string | undefined;

  if (title.includes('|')) {
    const parts = title.split('|').map(p => p.trim());
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
        guessedAuthor = lastPart.split(/reel by/iu).pop()?.trim();
      } else {
        guessedAuthor = lastPart.trim();
      }
    }
  } else if (title.toLowerCase().includes('reel by')) {
    guessedAuthor = title.split(/reel by/iu).pop()?.trim();
  }

  if (guessedAuthor) {
    const cleanGuess = guessedAuthor.toLowerCase();
    const isTooLong = guessedAuthor.length > 40;
    const isGeneric = cleanGuess === 'facebook' || cleanGuess === 'instagram' || cleanGuess.includes('log in');
    if (isTooLong || isGeneric) return undefined;
  }

  return guessedAuthor;
}

function getPlatformFallback(url: string, author?: string): string {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch')) return author || 'Facebook';
  if (lowerUrl.includes('instagram.com')) return author || 'Instagram';
  if (lowerUrl.includes('tiktok.com')) return author || 'TikTok';
  if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) return author || 'X';
  return author || 'Social Media';
}

export const normalizeArtist = (info: RawSocialData): string => {
  const title = info.metascraper?.title || info.title || '';
  let author = info.metascraper?.author || info.metascraper?.publisher;
  
  const isInvalid = !author || author.toLowerCase() === 'facebook' || author.toLowerCase() === 'instagram';

  if (isInvalid) {
    const guessed = guessAuthorFromTitle(title);
    if (guessed) author = guessed;
  }

  if (!author || author.toLowerCase() === 'facebook' || author.toLowerCase() === 'instagram') {
    author = info.uploader || info.artist || info.channel || info.creator || info.uploader_id;
  }

  if (author && typeof author === 'string' && author.toLowerCase() !== 'facebook' && author.toLowerCase() !== 'instagram') {
    return author;
  }

  if (info.webpageUrl && typeof info.webpageUrl === 'string') {
    return getPlatformFallback(info.webpageUrl, author as string);
  }

  return (author as string) || 'Social Media';
};

export const normalizeTitle = (info: RawSocialData): string => {
  const author = normalizeArtist(info);
  
  // prefer metascraper title
  const rawTitle = info.metascraper?.title || applySmartFallback(info);

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
    } catch (error: unknown) {
      const errorObj = error as Error;
      console.warn("[Proxy] Failed to proxy thumbnail:", errorObj.message);
      return thumbnailUrl;
    }
  }
  return thumbnailUrl;
};
