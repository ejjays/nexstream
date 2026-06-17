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
