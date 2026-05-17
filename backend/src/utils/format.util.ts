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

export function getFormatHeight(f: RawFormat): number {
  if (f.height) return Number(f.height);
  const res = f.resolution || '';
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
    .filter((f: RawFormat) => {
      const hasVideo = (f.vcodec && f.vcodec !== 'none') || f.is_video === true || f.has_video === true || f.hasVideo === true;
      return Boolean(hasVideo);
    })
    .map((f: RawFormat) => {
      let height = getFormatHeight(f);
      let resolution = f.resolution || f.quality_label || '';
      
      const dimMatch = resolution.match(/(\d+)x(\d+)/u);
      if (dimMatch) {
          const w = parseInt(dimMatch[1], 10);
          const h = parseInt(dimMatch[2], 10);
          height = Math.min(w, h);
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
      
      const acodec = f.acodec || (f.vcodec && f.vcodec !== 'none' ? 'yes' : 'none');
      const isMuxed = f.is_muxed || (f.vcodec !== 'none' && f.acodec !== 'none' && f.acodec !== undefined);
      
      let estimatedSize = f.filesize || f.filesize_approx || estimateFilesize(f, duration) || 0;
      if (f.ext === 'webm' || f.vcodec?.includes('av01') || f.vcodec?.includes('vp9')) {
          estimatedSize *= 1.35;
      }

      return {
        format_id: String(f.format_id),
        extension: 'mp4',
        ext: 'mp4',
        url: f.url,
        resolution: resolution,
        quality: resolution,
        filesize: Math.round(estimatedSize),
        fps: f.fps,
        height: height,
        vcodec: f.vcodec || 'yes',
        acodec: acodec,
        is_muxed: isMuxed,
        is_video: true,
        is_audio: f.is_audio || f.has_audio || f.hasAudio || acodec !== 'none'
      } as Format;
    });

  for (const f of processed) {
    const resKey =
      f.resolution && f.resolution !== "Unknown"
        ? f.resolution
        : `Unknown-${f.height || f.format_id}`;

    const key = `${resKey}-${f.ext}`;
    const existing = uniqueFormats.get(key);

    if (!existing) {
      uniqueFormats.set(key, f);
    } else {
      if (f.is_muxed && !existing.is_muxed) {
        uniqueFormats.set(key, f);
      }
      else if (
        f.is_muxed === existing.is_muxed &&
        (f.filesize || 0) > (existing.filesize || 0)
      ) {
        uniqueFormats.set(key, f);
      }
    }
  }
  
  return Array.from(uniqueFormats.values())
    .sort((a: Format, b: Format) => (b.height || 0) - (a.height || 0));
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
    .filter((f: RawFormat) => {
      const isAudioOnly = 
        ((f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none")) ||
        (f.format_id && String(f.format_id).includes('audio')) ||
        (f.ext === 'm4a' && (!f.vcodec || f.vcodec === "none")) ||
        (f.acodec && !f.vcodec)) && f.ext !== 'webm';
      
      return isAudioOnly || f.is_audio === true || f.has_audio === true || f.hasAudio === true;
    })
    .map((f: RawFormat) => {
      const abr = f.abr || f.tbr || 0;
      const quality = abr && Number(abr) > 0 ? `${Math.round(Number(abr))}kbps` : 'Audio';
      let extension = f.ext || 'm4a';
      if (extension === 'mp4' || extension === 'm4a' || f.acodec?.includes('mp4a') || f.format_id?.includes('m4a')) {
          extension = 'm4a';
      }
      
      return {
        format_id: String(f.format_id),
        extension: extension,
        ext: extension,
        url: f.url,
        quality: quality,
        resolution: quality,
        filesize: f.filesize || f.filesize_approx || 0,
        fps: 0,
        height: 0,
        vcodec: 'none',
        acodec: f.acodec || 'yes',
        is_muxed: false,
        is_video: false,
        is_audio: true
      } as Format;
    });

  for (const f of processed) {
    const qualityKey =
      f.quality && f.quality !== "Audio"
        ? f.quality
        : `Audio-${f.filesize || f.format_id}`;

    const key = `${qualityKey}-${f.ext}`;
    const existing = uniqueFormats.get(key);
    if (!existing || (f.filesize || 0) > (existing.filesize || 0)) {
      uniqueFormats.set(key, f);
    }
  }

  return Array.from(uniqueFormats.values())
    .sort((a: Format, b: Format) => {
      const abrA = parseInt(a.quality || '0', 10) || 0;
      const abrB = parseInt(b.quality || '0', 10) || 0;
      return abrB - abrA;
    });
}
