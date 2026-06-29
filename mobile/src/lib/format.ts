import { Format } from '../extractors/types';

export type DownloadState = {
  status: 'downloading' | 'muxing' | 'saving' | 'saved' | 'error';
  progress: number;
};

export type DownloadMeta = {
  title?: string;
  author?: string;
};

export function formatSize(bytes?: number): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

export function formatLabel(format: Format): string {
  return format.quality || format.resolution || format.formatId;
}

export type BadgeInfo = { label: string; tone: 'cyan' | 'amber' };

export function qualityText(format: Format): string {
  const raw = format.quality || format.resolution || '';
  if (raw.includes('4320')) return '8K';
  if (raw.includes('2160')) return '4K';
  if (raw.includes('1440')) return '2K';
  return formatLabel(format);
}

export function extLabel(format: Format): string {
  return (format.extension || 'RAW').toUpperCase();
}

export function isAudioOnly(format: Format): boolean {
  return format.isAudio && !format.isVideo;
}

export function titleFor(format: Format): string {
  return isAudioOnly(format) ? extLabel(format) : qualityText(format);
}

export function subtitleFor(format: Format): string {
  const size = formatSize(format.filesize);
  if (isAudioOnly(format)) {
    const tag =
      format.extension === 'mp3' && !format.noTranscode
        ? 'Converted'
        : 'Original';
    return size ? `${tag} · ${size}` : tag;
  }
  return size ? `${size} · ${extLabel(format)}` : extLabel(format);
}

export function badgeFor(format: Format): BadgeInfo | null {
  if (isAudioOnly(format)) {
    // converted mp3 HIGH, native source MAX
    return format.extension === 'mp3' && !format.noTranscode
      ? { label: 'HIGH', tone: 'cyan' }
      : { label: 'MAX', tone: 'amber' };
  }
  if (format.isMuxed) return { label: 'muxed', tone: 'cyan' };
  return null;
}

/* prefer muxed stream; reddit split a/v previews silent */
export function previewableFormat(
  formats: Format[],
  selected: Format | null,
  isAudio: boolean,
  extractorKey?: string
): Format | null {
  if (isAudio) return null;
  if (selected?.isMuxed && selected?.isVideo && selected?.url) {
    return selected;
  }
  const muxed = formats.find(
    (format) => format.isMuxed && format.isVideo && Boolean(format.url)
  );
  if (muxed) return muxed;
  // reddit: preview video track, no audio
  if (extractorKey === 'reddit') {
    if (selected?.isVideo && selected?.url) return selected;
    return (
      formats.find((format) => format.isVideo && Boolean(format.url)) ?? null
    );
  }
  return null;
}

export function dlLabel(state?: DownloadState): string {
  if (state?.status === 'downloading') return `${state.progress}%`;
  if (state?.status === 'saving') return `${state.progress}%`;
  if (state?.status === 'saved') return 'Done ✓';
  if (state?.status === 'error') return 'Retry';
  return 'Download';
}

export function prettyName(title: string): string {
  const cleaned = title
    .replace(/[<>:"/\\|?*[\]{}#%^`]/gu, '')
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
  if (extractorKey === 'bluesky') return 'https://bsky.app/';
  if (extractorKey === 'reddit') return 'https://www.reddit.com/';
  return 'https://www.facebook.com/';
}
