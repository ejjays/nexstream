import { getYoutubeClient } from "./client.js";
import { normalizeVideoInfo } from "./normalizer.js";
import { processVideoFormats } from "../../../utils/format.util.js";
import { Readable } from "node:stream";

export async function getInfo(url: string, _options?: any): Promise<any> {
  const videoId = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1] || url;
  const yt = await getYoutubeClient();
  const info = await yt.getInfo(videoId);
  
  const formats = processVideoFormats(info as any);
  return normalizeVideoInfo(videoId, url, info, formats);
}

export async function getStream(info: any, options: any): Promise<Readable> {
  const yt = await getYoutubeClient();
  const stream = await yt.download(info.id, {
    type: 'video+audio',
    quality: 'best',
    format: 'mp4',
    ...options
  });
  
  return Readable.fromWeb(stream as any);
}
