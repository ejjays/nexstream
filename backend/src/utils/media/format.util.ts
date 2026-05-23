import { Format } from '../../types/index.js';

export interface RawFormat {
  url?: string;
  bitrate?: number;
  height?: number;
  width?: number;
  fps?: string | number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesize_approx?: number;
  formatId?: string | number;
  format_id?: string | number;
  itag?: string | number;
  ext?: string;
  extension?: string;
  resolution?: string;
  quality_label?: string;
  abr?: number;
  tbr?: number;
  isAudio?: boolean;
  is_audio?: boolean;
  hasAudio?: boolean;
  has_audio?: boolean;
  isVideo?: boolean;
  is_video?: boolean;
  hasVideo?: boolean;
  has_video?: boolean;
  isMuxed?: boolean;
  is_muxed?: boolean;
  audioUrl?: string;
  audio_url?: string;
  [key: string]: unknown;
}

export function estimateFilesize(format: RawFormat, duration: number): number {
  if (format.filesize) return Number(format.filesize);
  if (format.filesize_approx) return Number(format.filesize_approx);

  const bitrate =
    Number(format.bitrate) || (format.tbr ? Number(format.tbr) * 1024 : 0);
  if (bitrate && duration) {
    return (bitrate * duration) / 8;
  }
  return 0;
}

export function getFormatHeight(format: RawFormat): number {
  if (format.height) return Number(format.height);

  const resolution = format.resolution || format.quality_label || '';
  const match = String(resolution).match(/(\d{3,4})p/u);
  if (match) return parseInt(match[1], 10);

  return 0;
}

function resolveResolution(format: RawFormat): {
  resolution: string;
  height: number;
} {
  let height = getFormatHeight(format);
  let resolution = String(format.resolution || format.quality_label || '');

  const dimMatch = resolution.match(/(\d+)x(\d+)/u);
  if (dimMatch) {
    const width = parseInt(dimMatch[1], 10);
    const hValue = parseInt(dimMatch[2], 10);
    height = Math.min(width, hValue);
  }

  if (height) {
    resolution = `${height}p`;
  } else if (resolution) {
    const hMatch = resolution.match(/(\d{3,4})p?/u);
    if (hMatch) {
      resolution = `${hMatch[1]}p`;
      height = parseInt(hMatch[1], 10);
    }
  }

  if (!resolution || resolution === '') resolution = 'Unknown';
  return { resolution, height };
}

function resolveCodecs(format: RawFormat) {
  const acodec = String(
    format.acodec ||
      (format.vcodec && format.vcodec !== 'none' ? 'yes' : 'none')
  );
  const vcodecStr = String(format.vcodec || '');
  const isMuxed =
    format.isMuxed ||
    format.is_muxed ||
    (vcodecStr !== 'none' &&
      vcodecStr !== '' &&
      acodec !== 'none' &&
      acodec !== '');

  return { acodec, vcodecStr, isMuxed: Boolean(isMuxed) };
}

function resolveVideoAudioFlags(format: RawFormat, acodec: string) {
  const isVideo = true; // explicitly for processVideoFormats
  const isAudio = Boolean(
    format.isAudio ||
    format.is_video === false ||
    format.is_audio ||
    format.hasAudio ||
    format.has_video ||
    (acodec !== 'none' && acodec !== '')
  );
  return { isVideo, isAudio };
}

function calculateFinalSize(
  format: RawFormat,
  duration: number,
  vcodec: string
) {
  let estimatedSize = estimateFilesize(format, duration);
  const extension = String(format.ext || format.extension || 'mp4');

  if (
    extension === 'webm' ||
    vcodec.includes('av01') ||
    vcodec.includes('vp9')
  ) {
    estimatedSize *= 1.35;
  }
  return Math.round(estimatedSize);
}

function mapRawToFormat(format: RawFormat, duration: number): Format | null {
  if (!format.url) return null;

  const { resolution, height } = resolveResolution(format);
  const { acodec, vcodecStr, isMuxed } = resolveCodecs(format);
  const { isVideo, isAudio } = resolveVideoAudioFlags(format, acodec);
  const filesize = calculateFinalSize(format, duration, vcodecStr);

  return {
    formatId: String(format.formatId || format.format_id || format.itag),
    extension: 'mp4',
    url: format.url,
    resolution,
    quality: resolution,
    filesize,
    fps: Number(format.fps) || 0,
    height,
    vcodec: vcodecStr || 'yes',
    acodec,
    isMuxed,
    isVideo,
    isAudio,
    audioUrl: format.audioUrl || format.audio_url || undefined,
    itag: Number(format.itag) || 0,
    width: Number(format.width) || 0,
  };
}

export function processVideoFormats(info: {
  duration?: number;
  formats?: RawFormat[];
  streaming_data?: { formats?: RawFormat[]; adaptive_formats?: RawFormat[] };
}): Format[] {
  const rawList: RawFormat[] = [
    ...(info.formats || []),
    ...(info.streaming_data?.formats || []),
    ...(info.streaming_data?.adaptive_formats || []),
  ];

  if (rawList.length === 0) return [];

  const uniqueFormats = new Map<string, Format>();
  const duration = info.duration || 0;

  const processed = rawList
    .filter((format: RawFormat) => {
      const isVideoFlag =
        format.isVideo === true ||
        format.is_video === true ||
        format.hasVideo === true ||
        format.has_video === true;
      const hasVideo =
        (format.vcodec && format.vcodec !== 'none') || isVideoFlag;
      return Boolean(hasVideo);
    })
    .map((format: RawFormat) => mapRawToFormat(format, duration))
    .filter((item): item is Format => item !== null);

  for (const format of processed) {
    const resKey =
      format.resolution && format.resolution !== 'Unknown'
        ? format.resolution
        : `Unknown-${format.height || format.formatId}`;

    const key = `${resKey}-${format.extension}`;
    const existing = uniqueFormats.get(key);

    if (
      !existing ||
      (format.isMuxed && !existing.isMuxed) ||
      (format.isMuxed === existing.isMuxed &&
        (format.filesize || 0) > (existing.filesize || 0))
    ) {
      uniqueFormats.set(key, format);
    }
  }

  return Array.from(uniqueFormats.values()).sort(
    (first: Format, second: Format) =>
      (second.height || 0) - (first.height || 0)
  );
}

export function processAudioFormats(info: {
  formats?: RawFormat[];
  streaming_data?: { formats?: RawFormat[]; adaptive_formats?: RawFormat[] };
}): Format[] {
  const formats: RawFormat[] = [
    ...(info.formats || []),
    ...(info.streaming_data?.formats || []),
    ...(info.streaming_data?.adaptive_formats || []),
  ];

  if (formats.length === 0) return [];

  const uniqueFormats = new Map<string, Format>();

  const processed = formats
    .filter((format: RawFormat) => {
      const formatId = String(
        format.formatId || format.format_id || format.itag || ''
      );
      const isAudioFlag =
        format.isAudio === true ||
        format.is_audio === true ||
        format.hasAudio === true ||
        format.has_audio === true;
      const extension = String(format.ext || format.extension || '');
      const acodec = String(format.acodec || '');
      const vcodec = String(format.vcodec || '');

      const isAudioOnly =
        ((acodec !== 'none' &&
          acodec !== '' &&
          (vcodec === 'none' || vcodec === '')) ||
          formatId.includes('audio') ||
          (extension === 'm4a' && (vcodec === 'none' || vcodec === '')) ||
          (acodec !== '' && vcodec === '')) &&
        extension !== 'webm';

      return isAudioOnly || isAudioFlag;
    })
    .map((format: RawFormat): Format | null => {
      if (!format.url) return null;

      const abr = Number(format.abr || format.tbr || 0);
      const quality = abr > 0 ? `${Math.round(abr)}kbps` : 'Audio';
      let extension = String(format.ext || format.extension || 'm4a');
      const formatId = String(
        format.formatId || format.format_id || format.itag
      );
      if (
        extension === 'mp4' ||
        extension === 'm4a' ||
        String(format.acodec).includes('mp4a') ||
        formatId.includes('m4a')
      ) {
        extension = 'm4a';
      }

      return {
        formatId,
        extension,
        url: format.url,
        quality,
        resolution: quality,
        filesize: Number(format.filesize || format.filesize_approx || 0),
        fps: 0,
        height: 0,
        vcodec: 'none',
        acodec: String(format.acodec || 'yes'),
        isMuxed: false,
        isVideo: false,
        isAudio: true,
        itag: Number(format.itag) || 0,
      };
    })
    .filter((item): item is Format => item !== null);

  for (const format of processed) {
    const qualityKey =
      format.quality && format.quality !== 'Audio'
        ? format.quality
        : `Audio-${format.filesize || format.formatId}`;

    const key = `${qualityKey}-${format.extension}`;
    const existing = uniqueFormats.get(key);
    if (!existing || (format.filesize || 0) > (existing.filesize || 0)) {
      uniqueFormats.set(key, format);
    }
  }

  return Array.from(uniqueFormats.values()).sort(
    (first: Format, second: Format) => {
      const abrA = parseInt(first.quality || '0', 10) || 0;
      const abrB = parseInt(second.quality || '0', 10) || 0;
      return abrB - abrA;
    }
  );
}
