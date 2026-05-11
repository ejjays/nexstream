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
}

export function getFormatHeight(f: RawFormat): number {
  if (f.height) return Number(f.height);
  const res = f.resolution || '';
  const match = String(res).match(/(\d+)p/);
  return match ? parseInt(match[1]) : 0;
}

export function estimateFilesize(format: Format, duration: number): number {
  if (format.filesize && format.filesize > 0) return format.filesize;
  
  // bits per second
  const vBitrate = (format as unknown as { tbr?: number }).tbr ? (format as unknown as { tbr?: number }).tbr! * 1000 : 0;
  const aBitrate = (format as unknown as { abr?: number }).abr ? (format as unknown as { abr?: number }).abr! * 1000 : 0;
  
  if (vBitrate || aBitrate) {
    return ((vBitrate + aBitrate) * duration) / 8;
  }

  // fallback to resolution-based heuristic if duration is available
  if (duration > 0) {
    const height = format.height || 0;
    let multiplier = 500 * 1024; // default 500KB/s
    
    if (height >= 2160) multiplier = 15 * 1024 * 1024 / 8; // 4K ~15Mbps
    else if (height >= 1440) multiplier = 8 * 1024 * 1024 / 8; // 1440p ~8Mbps
    else if (height >= 1080) multiplier = 4 * 1024 * 1024 / 8; // 1080p ~4Mbps
    else if (height >= 720) multiplier = 2 * 1024 * 1024 / 8;  // 720p ~2Mbps
    else if (height >= 480) multiplier = 1 * 1024 * 1024 / 8;  // 480p ~1Mbps
    else if (height > 0) multiplier = 500 * 1024 / 8;         // <480p ~500kbps

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
      return !!hasVideo;
    })
    .map((f: RawFormat) => {
      let height = getFormatHeight(f);
      let resolution = f.resolution || f.quality_label || '';
      
      // normalize resolution
      const dimMatch = resolution.match(/(\d+)x(\d+)/);
      if (dimMatch) {
          const w = parseInt(dimMatch[1]);
          const h = parseInt(dimMatch[2]);
          height = Math.min(w, h);
      }
      
      if (height) {
         resolution = `${height}p`;
      } else if (resolution) {
        const hMatch = resolution.match(/(\d{3,4})p?/);
        if (hMatch) {
            resolution = `${hMatch[1]}p`;
            height = parseInt(hMatch[1]);
        }
      }

      if (!resolution) resolution = 'Unknown';
      
      const acodec = f.acodec || (f.vcodec && f.vcodec !== 'none' ? 'yes' : 'none');
      const isMuxed = f.is_muxed || (f.vcodec !== 'none' && f.acodec !== 'none' && f.acodec !== undefined);
      
      return {
        format_id: String(f.format_id),
        extension: f.ext || 'mp4',
        ext: f.ext || 'mp4',
        url: f.url,
        resolution: resolution,
        quality: resolution,
        filesize: f.filesize || f.filesize_approx || estimateFilesize(f as any, duration) || 0,
        fps: f.fps,
        height: height,
        vcodec: f.vcodec || 'yes',
        acodec: acodec,
        is_muxed: isMuxed,
        is_video: true,
        is_audio: f.is_audio || f.has_audio || f.hasAudio || acodec !== 'none'
      } as Format;
    });

  // Deduplicate by resolution and extension, preferring muxed and larger filesize
  for (const f of processed) {
    const key = `${f.resolution}-${f.ext}`;
    const existing = uniqueFormats.get(key);
    
    if (!existing) {
      uniqueFormats.set(key, f);
    } else {
      // Prefer muxed streams
      if (f.is_muxed && !existing.is_muxed) {
        uniqueFormats.set(key, f);
      } 
      // If both are muxed or both are video-only, prefer the one with a larger filesize
      else if (f.is_muxed === existing.is_muxed && (f.filesize || 0) > (existing.filesize || 0)) {
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

  const uniqueFormats = new Map<string, RawFormat>();
  for (const f of formats) {
    const key = f.url || (f.format_id ? String(f.format_id) : undefined) || (f.itag ? String(f.itag) : undefined);
    if (key && !uniqueFormats.has(key)) {
      uniqueFormats.set(key, f);
    }
  }

  return Array.from(uniqueFormats.values())
    .filter((f: RawFormat) => {
      const isAudioOnly = 
        ((f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none")) ||
        (f.format_id && String(f.format_id).includes('audio')) ||
        (f.ext === 'm4a' && (!f.vcodec || f.vcodec === "none")) ||
        (f.acodec && !f.vcodec)) && f.ext !== 'webm';
      
      return isAudioOnly || f.is_audio === true || f.has_audio === true || f.hasAudio === true;
    })
    .map((f: RawFormat) => ({
      format_id: String(f.format_id),
      extension: f.ext || 'm4a',
      ext: f.ext || 'm4a',
      url: f.url,
      quality: (f as unknown as { abr?: number }).abr ? `${Math.round((f as unknown as { abr?: number }).abr!)}kbps` : 'Audio',
      filesize: f.filesize || f.filesize_approx || 0,
      fps: 0,
      height: 0,
      vcodec: 'none',
      acodec: f.acodec || 'yes',
      is_muxed: false,
      is_video: false,
      is_audio: true
    } as Format))
    .sort((a: Format, b: Format) => {
      const abrA = parseInt(a.quality || '0') || 0;
      const abrB = parseInt(b.quality || '0') || 0;
      return abrB - abrA;
    });
}
