const { downloadImageToBuffer } = require("./ytdlp.service");

function applySmartFallback(info) {
  let title = info.title;
  if (
    !title ||
    title.startsWith("Video by") ||
    title.startsWith("Reel by") ||
    title.toLowerCase() === "instagram" ||
    title.toLowerCase().includes("reactions") ||
    title.toLowerCase().includes("views")
  ) {
    if (info.description) {
      title = info.description.split("\n")[0].substring(0, 80).trim();
    }
  }
  return title;
}

function purgeSocialMetadata(title) {
  let text = title;
  text = text.replace(
    /\d+(?:\.\d+)?[KkM]?\s+(?:views|reactions|shares|likes)\b/gi,
    "",
  );

  text = text.replace(/#\w+/g, "");

  if (text.includes("|")) {
    const parts = text.split("|");
    text = parts[parts.length - 1].trim();
  }

  if (text.includes(" - ")) {
    const parts = text.split(" - ");
    if (parts[1].length < 15) text = parts[0].trim();
  }

  return text
    .replace(/^[\s\-|]+/, "")
    .replace(/[\s\-|]+$/, "")
    .trim();
}

exports.normalizeTitle = (info) => {
  let finalTitle = applySmartFallback(info);

  if (finalTitle) {
    finalTitle = purgeSocialMetadata(finalTitle);
  }

  if (!finalTitle || finalTitle.length < 2) {
    finalTitle = `Video_${Date.now()}`;
  }

  return finalTitle;
};

exports.getBestThumbnail = (info) => {
  let finalThumbnail = info.thumbnail;
  if (!finalThumbnail && info.thumbnails && info.thumbnails.length > 0) {
    const best = info.thumbnails.reduce((prev, current) => {
      return (prev.width || 0) > (current.width || 0) ? prev : current;
    });
    finalThumbnail = best.url;
  }
  return finalThumbnail;
};

exports.proxyThumbnailIfNeeded = async (thumbnailUrl, videoUrl) => {
  if (!thumbnailUrl || thumbnailUrl.startsWith("data:")) return thumbnailUrl;

  const isPermanentDomain =
    thumbnailUrl.includes("i.scdn.co") ||
    thumbnailUrl.includes("spotifycdn.com") ||
    thumbnailUrl.includes("ytimg.com") ||
    thumbnailUrl.includes("googleusercontent.com") ||
    thumbnailUrl.includes("ggpht.com");

  if (isPermanentDomain) {
    return thumbnailUrl;
  }

  const needsProxy =
    videoUrl.includes("instagram.com") ||
    videoUrl.includes("facebook.com") ||
    videoUrl.includes("tiktok.com");

  if (needsProxy) {
    try {
      const imgBuffer = await downloadImageToBuffer(thumbnailUrl);
      const base64Img = imgBuffer.toString("base64");
      const extension = thumbnailUrl.split(".").pop().split("?")[0] || "jpeg";
      const mimeType = extension === "png" ? "image/png" : "image/jpeg";

      console.log(
        `[Proxy] Volatile platform detected. Storing as Base64 (${mimeType})`,
      );
      return `data:${mimeType};base64,${base64Img}`;
    } catch (proxyErr) {
      console.warn("[Proxy] Failed to proxy thumbnail:", proxyErr.message);
      return thumbnailUrl;
    }
  }
  return thumbnailUrl;
};
