import { Format } from "../types/index.js";

interface RawFormat extends Partial<Format> {
  resolution?: string;
  filesize_approx?: number;
  is_video?: boolean;
  is_muxed?: boolean;
  is_audio?: boolean;
}

export function getFormatHeight(f: RawFormat): number {
  if (f.height) return Number(f.height);
  const res = f.resolution || '';
  const match = String(res).match(/(\d+)p/);
  return match ? parseInt(match[1]) : 0;
}

export function estimateFilesize(format: Format, duration: number): number {
  if (format.filesize) return format.filesize;
  // bits per second
  const vBitrate = (format as unknown as { tbr?: number }).tbr ? (format as unknown as { tbr?: number }).tbr! * 1000 : 0;
  const aBitrate = (format as unknown as { abr?: number }).abr ? (format as unknown as { abr?: number }).abr! * 1000 : 0;
  if (vBitrate || aBitrate) {
    return ((vBitrate + aBitrate) * duration) / 8;
  }
  return 0;
}

export function processVideoFormats(info: { formats?: RawFormat[] }): Format[] {
  if (!info.formats) return [];
  
  return info.formats
    .filter((f: RawFormat) => {
      const hasVideo = f.vcodec && f.vcodec !== 'none';
      const isExplicitVideo = f.is_video === true;
      return hasVideo || isExplicitVideo;
    })
    .map((f: RawFormat) => {
      const height = getFormatHeight(f);
      
      const acodec = f.acodec || (f.vcodec && f.vcodec !== 'none' ? 'yes' : 'none');
      const isMuxed = f.is_muxed || (f.vcodec !== 'none' && f.acodec !== 'none' && f.acodec !== undefined);
      
      return {
        format_id: String(f.format_id),
        extension: f.ext || 'mp4',
        ext: f.ext || 'mp4',
        url: f.url,
        resolution: f.resolution || `${height}p`,
        quality: f.resolution || `${height}p`,
        filesize: f.filesize || f.filesize_approx || 0,
        fps: f.fps,
        height: height,
        vcodec: f.vcodec || 'yes',
        acodec: acodec,
        is_muxed: isMuxed,
        is_video: true,
        is_audio: f.is_audio || acodec !== 'none'
      } as Format;
    })
    .sort((a: Format, b: Format) => (b.height || 0) - (a.height || 0));
}

export function processAudioFormats(info: { formats?: RawFormat[] }): Format[] {
  if (!info.formats) return [];

  return info.formats
    .filter((f: RawFormat) => {
      const isAudioOnly = 
        ((f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none")) ||
        (f.format_id && String(f.format_id).includes('audio')) ||
        (f.ext === 'm4a' && (!f.vcodec || f.vcodec === "none")) ||
        (f.acodec && !f.vcodec)) && f.ext !== 'webm';
      
      return isAudioOnly || f.is_audio === true;
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
