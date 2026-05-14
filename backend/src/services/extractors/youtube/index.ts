import { getYoutubeClient } from "./client.js";
import { normalizeVideoInfo } from "./normalizer.js";
import { processVideoFormats } from "../../../utils/format.util.js";
import { Readable } from "node:stream";
import type { VideoInfo, ExtractorOptions } from "../../../types/index.js";
import type { YT, Innertube } from "youtubei.js";
import type { ReadableStream } from "node:stream/web";

type DownloadOptions = Parameters<Innertube['download']>[1];

function extractVideoId(url: string): string {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('youtu.be')) {
      return urlObj.pathname.slice(1);
    }
    if (urlObj.hostname.includes('youtube.com')) {
      const v = urlObj.searchParams.get('v');
      if (v) return v;
      const paths = ['/shorts/', '/live/', '/embed/', '/v/'];
      for (const p of paths) {
        if (urlObj.pathname.includes(p)) {
          return urlObj.pathname.split(p)[1].split(/[?#]/)[0];
        }
      }
    }
  } catch {
    // ignore
  }
  return url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1] || url;
}

export async function getInfo(url: string, _options?: ExtractorOptions): Promise<VideoInfo> {
  const videoId = extractVideoId(url);
  const yt = await getYoutubeClient();
  const info = await yt.getInfo(videoId);
  
  const formats = processVideoFormats(info as unknown as YT.VideoInfo);
  return normalizeVideoInfo(videoId, url, info, formats);
}

export async function getStream(info: VideoInfo, _options?: DownloadOptions): Promise<Readable> {
  const yt = await getYoutubeClient();
  const stream = await yt.download(info.id, {
    type: 'video+audio',
    quality: 'best',
    format: 'mp4',
    ..._options
  });
  
  return Readable.fromWeb(stream as unknown as ReadableStream);
}
