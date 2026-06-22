import { Format } from '../extractors/types';

export type DownloadState = {
  status: 'downloading' | 'muxing' | 'saved' | 'error';
  progress: number;
};

export type DownloadMeta = {
  title?: string;
};

export function formatSize(bytes?: number): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

export function formatLabel(format: Format): string {
  return format.quality || format.resolution || format.formatId;
}

export function dlLabel(state?: DownloadState): string {
  if (state?.status === 'downloading') return `${state.progress}%`;
  if (state?.status === 'saved') return 'Done ✓';
  if (state?.status === 'error') return 'Retry';
  return 'Download';
}

export function prettyName(title: string): string {
  const cleaned = title
    .replace(/[<>:"/\\|?*]/gu, '')
    .replace(/[\r\n\t]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (cleaned.length > 64) return `${cleaned.slice(0, 64).trim()}...`;
  return cleaned || 'video';
}

export function refererFor(extractorKey: string): string {
  if (extractorKey === 'tiktok') return 'https://www.tiktok.com/';
  if (extractorKey === 'x') return 'https://x.com/';
  if (extractorKey === 'threads') return 'https://www.threads.com/';
  return 'https://www.facebook.com/';
}
