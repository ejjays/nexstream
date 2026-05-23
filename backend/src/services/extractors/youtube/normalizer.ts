import { Format, VideoInfo } from "../../../types/index.js";
import { YT } from "youtubei.js";

export function normalizeVideoInfo(videoId: string, url: string, raw: YT.VideoInfo, mappedFormats: Format[]): VideoInfo {
  const basic = raw.basic_info || {};
  
  return {
    type: 'video',
    id: videoId,
    title: basic.title || "Unknown Title",
    artist: basic.author || (basic as any).channel?.name || "Unknown Artist",
    uploader: basic.author || (basic as any).channel?.name || "Unknown Artist",
    album: "YouTube",
    thumbnail: basic.thumbnail?.[0]?.url || "",
    cover: basic.thumbnail?.[0]?.url || "",
    duration: basic.duration || 0,
    webpageUrl: url,
    formats: mappedFormats,
    audioFormats: mappedFormats.filter(f => f.isAudio && !f.isVideo),
    extractorKey: "youtube",
    isJsInfo: true,
    viewCount: (basic as any).view_count || 0,
    description: (basic as any).short_description || "",
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isFullData: false
  };
}
