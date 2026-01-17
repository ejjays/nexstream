/**
 * Processes and filters raw yt-dlp video formats into a clean list for the UI.
 */
exports.processVideoFormats = (info) => {
  if (!info.formats) return [];

  const formats = info.formats
    .filter(f => {
      const hasVideo = (f.vcodec && f.vcodec !== 'none') || f.height || f.width;
      const isStoryboard = f.format_id && f.format_id.startsWith('sb');
      return hasVideo && !isStoryboard;
    })
    .map(f => {
      let h = f.height || 0;
      if (!h && f.resolution) {
        const m = f.resolution.match(/(\d+)p/i) || f.resolution.match(/x(\d+)/);
        if (m) h = parseInt(m[1]);
      }

      // Prioritize resolution (e.g. 720p) over generic notes
      let q = h ? `${h}p` : '';
      if (!q) {
        q = f.format_note || f.resolution || 'Unknown';
      }

      if (/^\d+$/.test(q)) q += 'p';
      if (!q) q = 'Unknown';

      // Estimate size if missing
      let size = f.filesize || f.filesize_approx;
      if (!size && f.tbr && info.duration) {
        const bitrateInBits = Number(f.tbr) * 1000;
        const durationInSeconds = Number(info.duration);
        size = Math.floor((bitrateInBits * durationInSeconds) / 8);
      }

      return {
        format_id: f.format_id,
        extension: f.ext,
        quality: q,
        filesize: size,
        fps: f.fps,
        height: h,
        vcodec: f.vcodec
      };
    })
    .filter(f => f.height > 0 || f.quality !== 'Unknown')
    .sort((a, b) => b.height - a.height);

  // Deduplicate by quality name
  const uniqueFormats = [];
  const seenQualities = new Set();
  for (const f of formats) {
    if (!seenQualities.has(f.quality)) {
      uniqueFormats.push(f);
      seenQualities.add(f.quality);
    }
  }
  return uniqueFormats;
};

/**
 * Processes and filters raw yt-dlp formats to find the best audio options.
 */
exports.processAudioFormats = (info) => {
  if (!info.formats) return [];

  return info.formats
    .filter(f => f.acodec && f.acodec !== 'none')
    .map(f => {
      let quality = 'Audio';
      if (f.abr) {
        quality = `${Math.round(f.abr)}kbps`;
      } else if (f.tbr && (!f.vcodec || f.vcodec === 'none')) {
        quality = `${Math.round(f.tbr)}kbps`;
      } else if (f.format_note && f.format_note.includes('kbps')) {
        quality = f.format_note;
      } else if (f.format_id === '18') {
        quality = '128kbps (HQ)';
      } else {
        quality = f.format_note || 'Medium Quality';
      }

      return {
        format_id: f.format_id,
        extension: f.ext,
        quality: quality,
        filesize: f.filesize || f.filesize_approx,
        abr: f.abr || 0,
        vcodec: f.vcodec
      };
    })
    .sort((a, b) => {
      // Prioritize audio-only formats (no vcodec)
      if ((!a.vcodec || a.vcodec === 'none') && b.vcodec && b.vcodec !== 'none') return -1;
      if (a.vcodec && a.vcodec !== 'none' && (!b.vcodec || b.vcodec === 'none')) return 1;
      return b.abr - a.abr;
    })
    .reduce((acc, current) => {
      if (!acc.find(item => item.quality === current.quality)) acc.push(current);
      return acc;
    }, []);
};
