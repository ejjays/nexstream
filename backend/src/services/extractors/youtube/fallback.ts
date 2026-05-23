import { VideoInfo } from "../../../types/index.js";
import { getYoutubeClient } from "./client.js";
import { normalizeVideoInfo } from "./normalizer.js";
import { processVideoFormats } from "../../../utils/media/format.util.js";
import type { YT } from "youtubei.js";

export async function getInfoFallback(url: string): Promise<VideoInfo> {
    const videoId = url.split('v=')[1]?.split('&')[0];
    if (!videoId) throw new Error("Could not extract video ID");

    const yt = await getYoutubeClient();
    const info = await yt.getInfo(videoId);
    
    const formats = processVideoFormats(info as unknown as YT.VideoInfo);
    return normalizeVideoInfo(videoId, url, info, formats);
}
