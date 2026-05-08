export function getFormatHeight(f: any): number {
  if (f.height) return f.height;
  const res = f.resolution || '';
  const match = res.match(/(\d+)p/);
  return match ? parseInt(match[1]) : 0;
}

export function processVideoFormats(info: any): any[] {
  if (!info.formats) return [];
  
  return info.formats
    .filter((f: any) => {
      const hasVideo = f.vcodec && f.vcodec !== 'none';
      const isExplicitVideo = f.is_video === true;
      return hasVideo || isExplicitVideo;
    })
    .map((f: any) => {
      const height = getFormatHeight(f);
      return {
        format_id: f.format_id,
        extension: f.ext || 'mp4',
        ext: f.ext || 'mp4',
        url: f.url,
        quality: f.resolution || `${height}p`,
        filesize: f.filesize || f.filesize_approx || 0,
        fps: f.fps,
        height: height,
        vcodec: f.vcodec || 'yes',
        acodec: f.acodec || 'none',
        is_muxed: f.is_muxed || (f.vcodec !== 'none' && f.acodec !== 'none'),
        is_video: true,
        is_audio: f.acodec !== 'none'
      };
    })
    .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
}

export function processAudioFormats(info: any): any[] {
  if (!info.formats) return [];

  return info.formats
    .filter((f: any) => {
      const isAudioOnly = 
        ((f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none")) ||
        (f.format_id && String(f.format_id).includes('audio')) ||
        (f.ext === 'm4a' && (!f.vcodec || f.vcodec === "none")) ||
        (f.acodec && !f.vcodec)) && f.ext !== 'webm';
      
      return isAudioOnly || f.is_audio === true;
    })
    .map((f: any) => ({
      format_id: f.format_id,
      extension: f.ext || 'm4a',
      ext: f.ext || 'm4a',
      url: f.url,
      quality: f.abr ? `${Math.round(f.abr)}kbps` : 'Audio',
      filesize: f.filesize || f.filesize_approx || 0,
      fps: 0,
      height: 0,
      vcodec: 'none',
      acodec: f.acodec || 'yes',
      is_muxed: false,
      is_video: false,
      is_audio: true
    }))
    .sort((a: any, b: any) => {
      const abrA = parseInt(a.quality) || 0;
      const abrB = parseInt(b.quality) || 0;
      return abrB - abrA;
    });
}
