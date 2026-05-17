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
      const videoIdParam = urlObj.searchParams.get('v');
      if (videoIdParam) return videoIdParam;
      const paths = ['/shorts/', '/live/', '/embed/', '/v/'];
      for (const p of paths) {
        if (urlObj.pathname.includes(p)) {
          return urlObj.pathname.split(p)[1].split(/[?#]/u)[0];
        }
      }
    }
  } catch {
    // ignore
  }
  return url.match(/(?:v=|\/v\/)([0-9A-Za-z_-]{11})/)?.[1] || url;
}

type ExtractorDownloadOptions = DownloadOptions & {
  formatId?: string;
  format?: string;
  type?: string;
};

export async function getInfo(url: string, _options?: ExtractorOptions): Promise<VideoInfo> {
  const videoId = extractVideoId(url);
  const yt = await getYoutubeClient();
  const info = await yt.getInfo(videoId);
  
  const formats = processVideoFormats(info as unknown as YT.VideoInfo);
  return normalizeVideoInfo(videoId, url, info, formats);
}

export async function getStream(info: VideoInfo, _options?: ExtractorDownloadOptions): Promise<Readable> {
  const yt = await getYoutubeClient();
  
  const downloadOptions: DownloadOptions = {
    type: 'video+audio',
    quality: 'best',
    format: 'mp4'
  };

  const isAudioFormat = _options?.format === 'mp3' || _options?.format === 'm4a' || _options?.format === 'audio';
  if (isAudioFormat) {
    downloadOptions.type = 'audio';
    downloadOptions.format = _options?.format === 'mp3' ? 'any' : _options?.format;
  }

  if (_options?.type) {
    downloadOptions.type = _options.type;
  }

  const stream = await yt.download(info.id, downloadOptions);
  
  return Readable.fromWeb(stream as unknown as ReadableStream);
}
