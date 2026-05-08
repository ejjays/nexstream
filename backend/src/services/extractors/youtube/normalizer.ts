import { Format, VideoInfo } from "../../types/index.js";

export function normalizeVideoInfo(videoId: string, url: string, raw: any, mappedFormats: Format[]): VideoInfo {
  const basic = raw.basic_info || {};
  
  const videoInfo: VideoInfo = {
    id: videoId,
    title: basic.title || "Unknown Title",
    artist: basic.author || basic.uploader || "Unknown Artist",
    uploader: basic.author || basic.uploader || "Unknown Artist",
    album: "YouTube",
    thumbnail: basic.thumbnail?.[0]?.url || "",
    cover: basic.thumbnail?.[0]?.url || "",
    duration: basic.duration || 0,
    webpage_url: url,
    formats: mappedFormats,
    audioFormats: mappedFormats.filter(f => f.is_audio && !f.is_video),
    extractor_key: "Youtube",
    is_live: basic.is_live || false,
    view_count: basic.view_count || 0,
    description: basic.short_description || ""
  };

  return videoInfo;
}
