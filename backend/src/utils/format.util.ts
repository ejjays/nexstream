import { VideoInfo, Format } from '../types/index.js';

function getFormatHeight(f: any): number {
  let h = f.height || 0;
  if (!h && f.resolution) {
    const m =
      f.resolution.match(/(\d{3,4})p/) || f.resolution.match(/x(\d{3,4})/);
    if (m) h = parseInt(m[1]);
  }
  return h;
}

function getFormatQuality(f: any, h: number): string {
  let q = h ? `${h}p` : "";
  if (!q) {
    q = f.format_note || f.resolution || f.format_id || "Unknown";
  }
  if (/^\d+$/.test(q)) q += "p";
  if (q === "sd") q = "SD Quality";
  if (q === "hd") q = "HD Quality";
  return q;
}

export function estimateFilesize(f: any, duration: number | string | undefined): number {
  let size = f.filesize || f.filesize_approx;
  if (!size && duration) {
    const isAudio = (f.vcodec === 'none' || !f.vcodec) && (f.acodec && f.acodec !== 'none');
    // Default bitrates: 2500kbps for video (approx 720p), 128kbps for audio
    const defaultTbr = isAudio ? 128 : 2500;
    const bitrateInBits = Number(f.tbr || defaultTbr) * 1000;
    const durationInSeconds = Number(duration);
    size = Math.floor((bitrateInBits * durationInSeconds) / 8);
  }
  return size || 0;
}

export const processVideoFormats = (info: VideoInfo): Format[] => {
  if (!info.formats) return [];

  const formats = info.formats
    .filter((f: any) => {
      const vcodec = f.vcodec || "";
      const isStoryboard = f.format_id && f.format_id.startsWith("sb");
      if (isStoryboard) return false;
      return (vcodec && vcodec !== "none") || f.height || f.width || f.resolution || (f.format_id && (f.format_id.includes('video') || f.format_id === 'photo')) || f.ext === 'mp4' || f.video_ext === 'mp4';
    })
    .map((f: any) => {
      const h = getFormatHeight(f);
      const outExt = f.format_id === 'photo' ? (f.ext || 'jpg') : 'mp4';
      return {
        format_id: f.format_id,
        extension: outExt,
        url: f.url,
        quality: getFormatQuality(f, h),
        filesize: estimateFilesize(f, info.duration),
        fps: f.fps,
        height: h,
        vcodec: f.vcodec,
        acodec: f.acodec,
        ext: outExt,
        is_video: f.format_id !== 'photo',
        is_audio: true // Assuming muxed for video formats here
      };
    })
    .filter((f: any) => f.height > 0 || f.quality !== "Unknown" || f.format_id.includes('video') || f.extension === 'mp4')
    .sort((a, b) => {
       // video priority
       if (a.is_video !== b.is_video) return a.is_video ? -1 : 1;
       if (a.height !== b.height) return b.height - a.height;
       if (a.fps !== b.fps) return (Number(b.fps) || 0) - (Number(a.fps) || 0);
       return (b.filesize || 0) - (a.filesize || 0);
    });

  const uniqueFormats: Format[] = [];
  const seenKeys = new Set<string>();
  for (const f of formats) {
    const key = `${f.quality}_${f.fps || ""}`;
    if (!seenKeys.has(key)) {
      uniqueFormats.push(f as unknown as Format);
      seenKeys.add(key);
    }
  }
  return uniqueFormats;
};

function getAudioQuality(f: any): string {
  if (f.abr) return `${Math.round(f.abr)}kbps`;
  if (f.tbr && (!f.vcodec || f.vcodec === "none"))
    return `${Math.round(f.tbr)}kbps`;
  if (f.format_note && f.format_note.includes("kbps")) return f.format_note;
  if (f.format_id === "18") return "128kbps (HQ)";
  return f.format_note || "Medium Quality";
}

export const processAudioFormats = (info: VideoInfo): Format[] => {
  if (!info.formats) return [];

  const rawAudio = info.formats
    .filter(
      (f: any) =>
        ((f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none")) ||
        (f.format_id && f.format_id.includes('audio')) ||
        (f.ext === 'm4a' && (!f.vcodec || f.vcodec === "none")) ||
        (f.acodec && !f.vcodec)) && f.ext !== 'webm'
    )
    .map((f: any) => ({
      format_id: f.format_id,
      extension: f.ext,
      quality: getAudioQuality(f),
      filesize: f.filesize || f.filesize_approx,
      abr: f.abr || 0,
      url: f.url,
      ext: f.ext,
      is_audio: true,
      is_video: false
    }))
    .sort((a, b) => (b.abr || 0) - (a.abr || 0));

  if (!rawAudio.length) return [];
  rawAudio[0].quality = `${rawAudio[0].quality} (Original Master)`;

  const unique: Format[] = [];
  const seen = new Set<string>();
  for (const f of rawAudio) {
    if (!seen.has(f.quality)) {
      unique.push(f as unknown as Format);
      seen.add(f.quality);
    }
  }
  return unique;
};
