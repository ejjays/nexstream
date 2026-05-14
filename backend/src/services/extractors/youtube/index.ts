import { getYoutubeClient } from "./client.js";
import { normalizeVideoInfo } from "./normalizer.js";
import { processVideoFormats } from "../../../utils/format.util.js";
import { Readable } from "node:stream";
import { VideoInfo, ExtractorOptions } from "../../../types/index.js";

export async function getInfo(url: string): Promise<ReturnType<typeof normalizeVideoInfo>> {
  const videoId = url.match(/(?:watch\?v=|embed\/|v\/|shorts\/|youtu\.be\/)([0-9A-Za-z_-]{11})(?:[?&]|$)/)?.[1] || url;
  const yt = await getYoutubeClient();
  const info = await yt.getInfo(videoId);
  
  const formats = processVideoFormats(info);
  return normalizeVideoInfo(videoId, url, info, formats);
}

export async function getStream(
  info: VideoInfo,
  options: ExtractorOptions = {}
): Promise<Readable> {
  const yt = await getYoutubeClient();
  const stream: ReadableStream<Uint8Array> = await yt.download(info.id, {
    type: 'video+audio',
    quality: 'best',
    format: 'mp4',
    ...options as any
  });
  
  return Readable.fromWeb(stream as any);
}
