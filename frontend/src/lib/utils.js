import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const formatSize = (bytes) => {
  if (!bytes) return "Unknown size";
  const kb = bytes / 1024;
  const mb = kb / 1024;
  const gb = mb / 1024;

  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(kb)} KB`;
};

export const getQualityLabel = (quality) => {
  if (!quality) return "Unknown";
  if (quality.includes("4320")) return "8K";
  if (quality.includes("2160")) return "4K";
  if (quality.includes("1440")) return "2K";
  return quality.replaceAll(/\s*\(Original\sMaster\)/gi, "");
};

export const getSanitizedFilename = (
  title,
  artist,
  format,
  isSpotifyRequest,
) => {
  let displayTitle = title;
  if (isSpotifyRequest && artist) displayTitle = `${artist} - ${displayTitle}`;
  
  // clean complex punctuation and formatting
  let sanitized = displayTitle
    .replace(/[<>:"/\\|?*]/g, "") // illegal chars
    .replace(/[\n\r\t]/g, " ")    // newlines
    .replace(/\s+/g, " ")        // collapse spaces
    .trim();

  // truncate very long titles
  const MAX_LENGTH = 64;
  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.substring(0, MAX_LENGTH).trim() + "...";
  }

  return `${sanitized || "video"}.${format}`;
};
