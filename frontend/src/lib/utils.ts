import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatSize = (bytes?: number) => {
  if (!bytes) return "Unknown size";
  const kb = bytes / 1024;
  const mb = kb / 1024;
  const gb = mb / 1024;

  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(kb)} KB`;
};

export const getQualityLabel = (quality?: string) => {
  if (!quality) return "Unknown";
  if (quality.includes("4320")) return "8K";
  if (quality.includes("2160")) return "4K";
  if (quality.includes("1440")) return "2K";
  return quality.replaceAll(/\s*\(Original\sMaster\)/gi, "");
};

export const getSanitizedFilename = (
  title: string,
  artist: string,
  format: string,
  isSpotifyRequest: boolean,
) => {
  let displayTitle = title;
  if (isSpotifyRequest && artist) displayTitle = `${artist} - ${displayTitle}`;
  
  // clean punctuation
  let sanitized = displayTitle
    .replace(/[<>:"/\|?*]/g, "") // illegal chars
    .replace(/[\r\n\t]+/g, " ")  // newlines
    .replace(/\s+/g, " ")        // collapse spaces
    .trim();

  // truncate very long titles
  const MAX_LENGTH = 64;
  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.substring(0, MAX_LENGTH).trim() + "...";
  }

  return `${sanitized || "video"}.${format}`;
};

export const generateUUID = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
