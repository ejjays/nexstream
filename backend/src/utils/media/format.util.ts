import { Format } from "../../types/index.js";

interface RawFormat {
  url?: string;
  bitrate?: number;
  height?: number;
  width?: number;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesize_approx?: number;
  formatId?: string | number;
  format_id?: string | number;
  itag?: number;
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
  [key: string]: any;
}

export function estimateFilesize(format: RawFormat, duration: number): number {
  if (format.filesize) return format.filesize;
  if (format.filesize_approx) return format.filesize_approx;
  
  const bitrate = format.bitrate || (format.tbr ? format.tbr * 1024 : 0);
  if (bitrate && duration) {
    return (bitrate * duration) / 8;
  }
  return 0;
}

export function getFormatHeight(format: RawFormat): number {
  if (format.height) return format.height;
  
  const resolution = format.resolution || format.quality_label || '';
  const match = resolution.match(/(\d{3,4})p/u);
  if (match) return parseInt(match[1], 10);
  
  return 0;
}

export function processVideoFormats(info: { duration?: number; formats?: RawFormat[]; streaming_data?: { formats?: RawFormat[]; adaptive_formats?: RawFormat[] } }): Format[] {
  const formats: RawFormat[] = [
    ...(info.formats || []),
    ...(info.streaming_data?.formats || []),
    ...(info.streaming_data?.adaptive_formats || [])
  ];
  
  if (formats.length === 0) return [];
  
  const uniqueFormats = new Map<string, Format>();
  const duration = info.duration || 0;

  const processed = formats
    .filter((format: RawFormat) => {
      const isVideoFlag = format.isVideo === true || format.is_video === true || format.hasVideo === true || format.has_video === true;
      const hasVideo = (format.vcodec && format.vcodec !== 'none') || isVideoFlag;
      return Boolean(hasVideo);
    })
    .map((format: RawFormat): Format | null => {
      if (!format.url) return null;

      let height = getFormatHeight(format);
      let resolution = format.resolution || format.quality_label || '';
      
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

      if (!resolution) resolution = 'Unknown';
      
      const acodec = format.acodec || (format.vcodec && format.vcodec !== 'none' ? 'yes' : 'none');
      const isMuxed = format.isMuxed || format.is_muxed || (format.vcodec !== 'none' && format.acodec !== 'none' && format.acodec !== undefined);
      
      let estimatedSize = format.filesize || format.filesize_approx || estimateFilesize(format, duration) || 0;
      const rawExt = format.ext || format.extension || 'mp4';
      if (rawExt === 'webm' || format.vcodec?.includes('av01') || format.vcodec?.includes('vp9')) {
          estimatedSize *= 1.35;
      }

      const formatId = String(format.formatId || format.format_id || format.itag);

      return {
        formatId,
        extension: 'mp4',
        url: format.url,
        resolution,
        quality: resolution,
        filesize: Math.round(estimatedSize),
        fps: format.fps,
        height,
        vcodec: format.vcodec || 'yes',
        acodec,
        isMuxed: Boolean(isMuxed),
        isVideo: true,
        isAudio: Boolean(format.isAudio || format.is_video === false || format.is_audio || format.hasAudio || format.has_video || acodec !== 'none'),
        audioUrl: format.audioUrl || format.audio_url || undefined,
        itag: format.itag,
        width: format.width,
      };
    })
    .filter((f): f is Format => f !== null);

  for (const format of processed) {
    const resKey =
      format.resolution && format.resolution !== "Unknown"
        ? format.resolution
        : `Unknown-${format.height || format.formatId}`;

    const key = `${resKey}-${format.extension}`;
    const existing = uniqueFormats.get(key);

    if (!existing) {
      uniqueFormats.set(key, format);
    } else {
      if (format.isMuxed && !existing.isMuxed) {
        uniqueFormats.set(key, format);
      }
      else if (
        format.isMuxed === existing.isMuxed &&
        (format.filesize || 0) > (existing.filesize || 0)
      ) {
        uniqueFormats.set(key, format);
      }
    }
  }
  
  return Array.from(uniqueFormats.values())
    .sort((first: Format, second: Format) => (second.height || 0) - (first.height || 0));
}

export function processAudioFormats(info: { formats?: RawFormat[]; streaming_data?: { formats?: RawFormat[]; adaptive_formats?: RawFormat[] } }): Format[] {
  const formats: RawFormat[] = [
    ...(info.formats || []),
    ...(info.streaming_data?.formats || []),
    ...(info.streaming_data?.adaptive_formats || [])
  ];

  if (formats.length === 0) return [];

  const uniqueFormats = new Map<string, Format>();

  const processed = formats
    .filter((format: RawFormat) => {
      const formatId = String(format.formatId || format.format_id || format.itag || '');
      const isAudioFlag = format.isAudio === true || format.is_audio === true || format.hasAudio === true || format.has_audio === true;
      const isAudioOnly = 
        ((format.acodec && format.acodec !== "none" && (!format.vcodec || format.vcodec === "none")) ||
        (formatId.includes('audio')) ||
        ((format.ext || format.extension) === 'm4a' && (!format.vcodec || format.vcodec === "none")) ||
        (format.acodec && !format.vcodec)) && (format.ext || format.extension) !== 'webm';
      
      return isAudioOnly || isAudioFlag;
    })
    .map((format: RawFormat): Format | null => {
      if (!format.url) return null;

      const abr = format.abr || format.tbr || 0;
      const quality = abr && Number(abr) > 0 ? `${Math.round(Number(abr))}kbps` : 'Audio';
      let extension = format.ext || format.extension || 'm4a';
      const formatId = String(format.formatId || format.format_id || format.itag);
      if (extension === 'mp4' || extension === 'm4a' || format.acodec?.includes('mp4a') || formatId.includes('m4a')) {
          extension = 'm4a';
      }
      
      return {
        formatId,
        extension,
        url: format.url,
        quality,
        resolution: quality,
        filesize: format.filesize || format.filesize_approx || 0,
        fps: 0,
        height: 0,
        vcodec: 'none',
        acodec: format.acodec || 'yes',
        isMuxed: false,
        isVideo: false,
        isAudio: true,
        itag: format.itag,
      };
    })
    .filter((f): f is Format => f !== null);

  for (const format of processed) {
    const qualityKey =
      format.quality && format.quality !== "Audio"
        ? format.quality
        : `Audio-${format.filesize || format.formatId}`;

    const key = `${qualityKey}-${format.extension}`;
    const existing = uniqueFormats.get(key);
    if (!existing || (format.filesize || 0) > (existing.filesize || 0)) {
      uniqueFormats.set(key, format);
    }
  }

  return Array.from(uniqueFormats.values())
    .sort((first: Format, second: Format) => {
      const abrA = parseInt(first.quality || '0', 10) || 0;
      const abrB = parseInt(second.quality || '0', 10) || 0;
      return abrB - abrA;
    });
}
