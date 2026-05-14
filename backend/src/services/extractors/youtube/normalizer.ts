import { Format, VideoInfo } from "../../../types/index.js";
import { YT } from "youtubei.js";

export function normalizeVideoInfo(videoId: string, url: string, raw: YT.VideoInfo, mappedFormats: Format[]): VideoInfo {
  const basic = raw.basic_info || {};
  
  const videoInfo: VideoInfo = {
    id: videoId,
    title: basic.title || "Unknown Title",
    artist: basic.author || basic.channel?.name || "Unknown Artist",
    uploader: basic.author || basic.channel?.name || "Unknown Artist",
    album: "YouTube",
    thumbnail: basic.thumbnail?.[0]?.url || "",
    cover: basic.thumbnail?.[0]?.url || "",
    duration: basic.duration || 0,
    webpage_url: url,
    formats: mappedFormats,
    audioFormats: mappedFormats.filter(f => f.is_audio && !f.is_video),
    extractor_key: "youtube",
    is_js_info: true,
    view_count: basic.view_count || 0,
    description: basic.short_description || ""
  };

  return videoInfo;
}
