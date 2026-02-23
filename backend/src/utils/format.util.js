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
    q = f.format_note || f.resolution || "Unknown";
  }
  if (/^\d+$/.test(q)) q += "p";
  return q || "Unknown";
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

exports.processVideoFormats = (info) => {
  if (!info.formats) return [];

  const formats = info.formats
    .filter((f) => {
      const hasVideo = (f.vcodec && f.vcodec !== "none") || f.height || f.width;
      const isStoryboard = f.format_id && f.format_id.startsWith("sb");
      return hasVideo && !isStoryboard;
    })
    .map((f) => {
      const h = getFormatHeight(f);
      return {
        format_id: f.format_id,
        extension: "mp4",
        quality: getFormatQuality(f, h),
        filesize: estimateFilesize(f, info.duration),
        fps: f.fps,
        height: h,
        vcodec: f.vcodec,
      };
    })
    .filter((f) => f.height > 0 || f.quality !== "Unknown")
    .sort((a, b) => b.height - a.height);

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
        f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none"),
    )
    .map((f) => ({
      format_id: f.format_id,
      extension: f.ext,
      quality: getAudioQuality(f),
      filesize: f.filesize || f.filesize_approx,
      abr: f.abr || 0,
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
