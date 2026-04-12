function getFormatHeight(f) {
  let h = f.height || 0;
  if (!h && f.resolution) {
    const m =
      f.resolution.match(/(\d{3,4})p/) || f.resolution.match(/x(\d{3,4})/);
    if (m) h = parseInt(m[1]);
  }
  return h;
}

function getFormatQuality(f, h) {
  let q = h ? `${h}p` : "";
  if (!q) {
    q = f.format_note || f.resolution || f.format_id || "Unknown";
  }
  if (/^\d+$/.test(q)) q += "p";
  if (q === "sd") q = "SD Quality";
  if (q === "hd") q = "HD Quality";
  return q;
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

exports.estimateFilesize = estimateFilesize;

exports.processVideoFormats = (info) => {
  if (!info.formats) return [];

  const formats = info.formats
    .filter((f) => {
      const vcodec = f.vcodec || "";
      const isStoryboard = f.format_id && f.format_id.startsWith("sb");
      if (isStoryboard) return false;
      return (vcodec && vcodec !== "none") || f.height || f.width || f.resolution || (f.format_id && f.format_id.includes('video')) || f.ext === 'mp4' || f.video_ext === 'mp4';
    })
    .map((f) => {
      const h = getFormatHeight(f);
      const vcodec = f.vcodec || "";
      const isAvc = vcodec.startsWith("avc1") || vcodec.startsWith("h264");
      // force mp4 compatibility
      const outExt = "mp4";
      return {
        format_id: f.format_id,
        extension: outExt,
        quality: getFormatQuality(f, h),
        filesize: estimateFilesize(f, info.duration),
        fps: f.fps,
        height: h,
        vcodec: f.vcodec,
        acodec: f.acodec,
        url: f.url,
      };
    })
    .filter((f) => f.height > 0 || f.quality !== "Unknown" || f.format_id.includes('video') || f.extension === 'mp4')
    .sort((a, b) => {
       const qualityA = a.quality.includes('HD') ? 1000 : a.height;
       const qualityB = b.quality.includes('HD') ? 1000 : b.height;
       return qualityB - qualityA;
    });

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
  if (f.tbr && (!f.vcodec || f.vcodec === "none"))
    return `${Math.round(f.tbr)}kbps`;
  if (f.format_note && f.format_note.includes("kbps")) return f.format_note;
  if (f.format_id === "18") return "128kbps (HQ)";
  return f.format_note || "Medium Quality";
}

exports.processAudioFormats = (info) => {
  if (!info.formats) return [];

  const rawAudio = info.formats
    .filter(
      (f) =>
        ((f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none")) ||
        (f.format_id && f.format_id.includes('audio')) ||
        (f.ext === 'm4a' && (!f.vcodec || f.vcodec === "none")) ||
        (f.acodec && !f.vcodec)) && f.ext !== 'webm'
    )
    .map((f) => ({
      format_id: f.format_id,
      extension: f.ext,
      quality: getAudioQuality(f),
      filesize: f.filesize || f.filesize_approx,
      abr: f.abr || 0,
      url: f.url,
    }))
    .sort((a, b) => b.abr - a.abr);

  if (!rawAudio.length) return [];
  rawAudio[0].quality = `${rawAudio[0].quality} (Original Master)`;

  const unique = [];
  const seen = new Set();
  for (const f of rawAudio) {
    if (!seen.has(f.quality)) {
      unique.push(f);
      seen.add(f.quality);
    }
  }
  return unique;
};
