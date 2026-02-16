import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const formatSize = (bytes) => {
  if (!bytes) return 'Unknown size';
  const kb = bytes / 1024;
  const mb = kb / 1024;
  const gb = mb / 1024;

  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(kb)} KB`;
};

export const getQualityLabel = (quality) => {
  if (!quality) return 'Unknown';
  if (quality.includes('4320')) return '8K';
  if (quality.includes('2160')) return '4K';
  if (quality.includes('1440')) return '2K';
  return quality.replace(/\s*\(Original\sMaster\)/i, '');
};

export const getSanitizedFilename = (title, artist, format, isSpotifyRequest) => {
    let displayTitle = title;
    if (isSpotifyRequest && artist) displayTitle = `${artist} — ${displayTitle}`;
    const sanitized = displayTitle.replaceAll(/[<>:"/\\|?*]/g, '').trim() || 'video';
    return `${sanitized}.${format}`;
};
