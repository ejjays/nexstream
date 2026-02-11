function getFormatHeight(f) {
  let h = f.height || 0;
  if (!h && f.resolution) {
    const m = f.resolution.match(/(\d{3,4})p/) || f.resolution.match(/x(\d{3,4})/);
    if (m) h = parseInt(m[1]);
  }
  return h;
}

function getFormatQuality(f, h) {
  let q = h ? `${h}p` : '';
  if (!q) {
    q = f.format_note || f.resolution || 'Unknown';
  }
  if (/^\d+$/.test(q)) q += 'p';
  return q || 'Unknown';
}

function estimateFilesize(f, duration) {
  let size = f.filesize || f.filesize_approx;
  if (!size && f.tbr && duration) {
    const bitrateInBits = Number(f.tbr) * 1000;
    const durationInSeconds = Number(duration);
    size = Math.floor((bitrateInBits * durationInSeconds) / 8);
  }
  return size;
}

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
      const h = getFormatHeight(f);
      return {
        format_id: f.format_id,
        extension: 'mp4', // ALWAYS show mp4 for video UI as we remux everything to mp4
        quality: getFormatQuality(f, h),
        filesize: estimateFilesize(f, info.duration),
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

function getAudioQuality(f) {
  if (f.abr) return `${Math.round(f.abr)}kbps`;
  if (f.tbr && (!f.vcodec || f.vcodec === 'none')) return `${Math.round(f.tbr)}kbps`;
  if (f.format_note && f.format_note.includes('kbps')) return f.format_note;
  if (f.format_id === '18') return '128kbps (HQ)';
  return f.format_note || 'Medium Quality';
}

/**
 * Processes and filters raw yt-dlp formats to find the best audio options.
 */
exports.processAudioFormats = (info) => {
  if (!info.formats) return [];

  const audioFormats = info.formats
    .filter(f => {
      // STRICT FILTER: Must have audio AND must NOT have video
      const hasAudio = f.acodec && f.acodec !== 'none';
      const hasNoVideo = !f.vcodec || f.vcodec === 'none';
      return hasAudio && hasNoVideo;
    })
    .map(f => ({
      format_id: f.format_id,
      extension: f.ext,
      quality: getAudioQuality(f),
      filesize: f.filesize || f.filesize_approx,
      abr: f.abr || 0,
      vcodec: f.vcodec
    }))
    .sort((a, b) => {
      // Prioritize audio-only formats (no vcodec)
      const aAudioOnly = (!a.vcodec || a.vcodec === 'none');
      const bAudioOnly = (!b.vcodec || b.vcodec === 'none');
      
      if (aAudioOnly && !bAudioOnly) return -1;
      if (!aAudioOnly && bAudioOnly) return 1;

      return b.abr - a.abr;
    });

  // Tag the best format and deduplicate
  return audioFormats.map((f, index) => {
      if (index === 0) {
        f.quality = `${f.quality} (Original Master)`;
        f.is_best = true;
      }
      return f;
    })
    .reduce((acc, current) => {
      if (!acc.find(item => item.quality === current.quality)) acc.push(current);
      return acc;
    }, []);
};
