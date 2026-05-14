import { getYoutubeClient } from "./client.js";
import { normalizeVideoInfo } from "./normalizer.js";
import { processVideoFormats } from "../../../utils/format.util.js";
import { Readable } from "node:stream";

export async function getInfo(url: string): Promise<ReturnType<typeof normalizeVideoInfo>> {
  const videoId = url.match(/(?:v=|\/)\([0-9A-Za-z_-]{11}\)/)?.[1] || url;
  const yt = await getYoutubeClient();
  const info = await yt.getInfo(videoId);
  
  const formats = processVideoFormats(info);
  return normalizeVideoInfo(videoId, url, info, formats);
}

export async function getStream(
  info: { id: string },
  _options: Record<string, unknown>
): Promise<Readable> {
  const yt = await getYoutubeClient();
  const stream: ReadableStream<Uint8Array> = await yt.download(info.id, {
    type: 'video+audio',
    quality: 'best',
    format: 'mp4',
    ..._options
  });
  
  return Readable.fromWeb(stream);
}
