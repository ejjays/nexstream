import { Format } from "../types/index.js";

interface RawFormat extends Omit<Partial<Format>, 'itag'> {
  resolution?: string;
  quality_label?: string;
  filesize_approx?: number;
  is_video?: boolean;
  is_muxed?: boolean;
  is_audio?: boolean;
  has_video?: boolean;
  has_audio?: boolean;
  hasVideo?: boolean;
  hasAudio?: boolean;
  itag?: string | number;
  tbr?: number;
  vbr?: number;
  abr?: number;
}

export function getFormatHeight(format: RawFormat): number {
  if (format.height) return Number(format.height);
  const res = format.resolution || '';
  const match = String(res).match(/(\d+)p/u);
  return match ? parseInt(match[1], 10) : 0;
}

export function estimateFilesize(format: RawFormat, duration: number): number {
  if (format.filesize && format.filesize > 0) return format.filesize;
  
  const tbr = format.tbr || (format.vbr || 0) + (format.abr || 0);
  const bps = tbr ? tbr * 1000 : 0;
  
  if (bps > 0) {
    return (bps * duration) / 8;
  }

  if (duration > 0) {
    const height = format.height || 0;
    let multiplier = (500 * 1024) / 8;
    
    if (height >= 4320) multiplier = (30 * 1024 * 1024) / 8;
    else if (height >= 2160) multiplier = (15 * 1024 * 1024) / 8;
    else if (height >= 1440) multiplier = (8 * 1024 * 1024) / 8;
    else if (height >= 1080) multiplier = (4 * 1024 * 1024) / 8;
    else if (height >= 720) multiplier = (2 * 1024 * 1024) / 8;
    else if (height >= 480) multiplier = (1 * 1024 * 1024) / 8;
    else if (height > 0) multiplier = (500 * 1024) / 8;

    return multiplier * duration;
  }

  return 0;
}

export function processVideoFormats(info: { duration?: number, formats?: RawFormat[]; streaming_data?: { formats?: RawFormat[]; adaptive_formats?: RawFormat[] } }): Format[] {
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
      const hasVideo = (format.vcodec && format.vcodec !== 'none') || format.is_video === true || format.has_video === true || format.hasVideo === true;
      return Boolean(hasVideo);
    })
    .map((format: RawFormat) => {
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
      const isMuxed = format.is_muxed || (format.vcodec !== 'none' && format.acodec !== 'none' && format.acodec !== undefined);
      
      let estimatedSize = format.filesize || format.filesize_approx || estimateFilesize(format, duration) || 0;
      if (format.ext === 'webm' || format.vcodec?.includes('av01') || format.vcodec?.includes('vp9')) {
          estimatedSize *= 1.35;
      }

      return {
        format_id: String(format.format_id),
        extension: 'mp4',
        ext: 'mp4',
        url: format.url,
        resolution: resolution,
        quality: resolution,
        filesize: Math.round(estimatedSize),
        fps: format.fps,
        height: height,
        vcodec: format.vcodec || 'yes',
        acodec: acodec,
        is_muxed: isMuxed,
        is_video: true,
        is_audio: format.is_audio || format.has_audio || format.hasAudio || acodec !== 'none'
      } as Format;
    });

  for (const format of processed) {
    const resKey =
      format.resolution && format.resolution !== "Unknown"
        ? format.resolution
        : `Unknown-${format.height || format.format_id}`;

    const key = `${resKey}-${format.ext}`;
    const existing = uniqueFormats.get(key);

    if (!existing) {
      uniqueFormats.set(key, format);
    } else {
      if (format.is_muxed && !existing.is_muxed) {
        uniqueFormats.set(key, format);
      }
      else if (
        format.is_muxed === existing.is_muxed &&
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
      const isAudioOnly = 
        ((format.acodec && format.acodec !== "none" && (!format.vcodec || format.vcodec === "none")) ||
        (format.format_id && String(format.format_id).includes('audio')) ||
        (format.ext === 'm4a' && (!format.vcodec || format.vcodec === "none")) ||
        (format.acodec && !format.vcodec)) && format.ext !== 'webm';
      
      return isAudioOnly || format.is_audio === true || format.has_audio === true || format.hasAudio === true;
    })
    .map((format: RawFormat) => {
      const abr = format.abr || format.tbr || 0;
      const quality = abr && Number(abr) > 0 ? `${Math.round(Number(abr))}kbps` : 'Audio';
      let extension = format.ext || 'm4a';
      if (extension === 'mp4' || extension === 'm4a' || format.acodec?.includes('mp4a') || format.format_id?.includes('m4a')) {
          extension = 'm4a';
      }
      
      return {
        format_id: String(format.format_id),
        extension: extension,
        ext: extension,
        url: format.url,
        quality: quality,
        resolution: quality,
        filesize: format.filesize || format.filesize_approx || 0,
        fps: 0,
        height: 0,
        vcodec: 'none',
        acodec: format.acodec || 'yes',
        is_muxed: false,
        is_video: false,
        is_audio: true
      } as Format;
    });

  for (const format of processed) {
    const qualityKey =
      format.quality && format.quality !== "Audio"
        ? format.quality
        : `Audio-${format.filesize || format.format_id}`;

    const key = `${qualityKey}-${format.ext}`;
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
