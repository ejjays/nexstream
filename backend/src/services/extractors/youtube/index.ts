import { Readable } from 'node:stream';
import { VideoInfo, ExtractorOptions } from '../../../types/index.js';
import { getYoutubeInstance } from './client.js';
import { getFallbackInfo } from './fallback.js';
import { mapFormats, normalizeVideoInfo } from './normalizer.js';

function extractId(url: string): string {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([^?&"'>]+)/);
  return match ? match[1] : url.split('/').pop()!.split('?')[0];
}

export async function getInfo(url: string, options: ExtractorOptions = {}): Promise<VideoInfo> {
  const videoId = extractId(url);

  let videoInfo: { streaming_data?: { formats?: unknown[]; adaptive_formats?: unknown[] } };
  let yt: Awaited<ReturnType<typeof getYoutubeInstance>>;
  try {
    yt = await getYoutubeInstance();
    videoInfo = (await yt.getInfo(videoId)) as { streaming_data?: { formats?: unknown[]; adaptive_formats?: unknown[] } };
  } catch (err: unknown) {
    const error = err as Error;
    console.warn(`[Metadata] Pure-JS failed for ${videoId}, attempting yt-dlp fallback:`, error.message);
    return await getFallbackInfo(url);
  }

  const { streaming_data } = videoInfo;

  if (!streaming_data) {
    console.warn(`[JS-YT] No streams for ${videoId}, fallback...`);
    return await getFallbackInfo(url);
  }

  const formats: unknown[] = streaming_data.formats ?? [];
  const adaptive: unknown[] = streaming_data.adaptive_formats ?? [];
  const allFormats: unknown[] = [...formats, ...adaptive];

  const mappedFormats = await mapFormats(allFormats, videoId, yt);
  return normalizeVideoInfo(videoId, url, videoInfo, mappedFormats);
}

export async function getStream(videoInfo: VideoInfo, options: ExtractorOptions & { _retried?: boolean } = {}): Promise<Readable> {
  const { formatId } = options;
  const itagNum = formatId ? parseInt(formatId) : NaN;
  
  let format = videoInfo.formats.find((f) => String(f.format_id) === String(formatId));
  if (!format && !formatId) {
    format = videoInfo.formats.find((f) => f.is_audio) || videoInfo.formats[0];
  }

  if (format?.url && !format.url.startsWith('PENDING')) {
    try {
      const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      const response = await fetch(format.url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.youtube.com/',
          'Range': 'bytes=0-'
        }
      });
      if (response.ok && response.body) return Readable.fromWeb(response.body);
    } catch (e: unknown) {
      const error = e as Error;
      console.error(`[JS-YT] Direct URL error:`, error.message);
    }
  }

  const originalInfo = videoInfo.original_info;
  if (originalInfo) {
    const downloadOptions: { quality: string; type: string; format: string; itag?: number } = { quality: 'best', type: 'audio', format: 'mp4' };
    if (!isNaN(itagNum)) downloadOptions.itag = itagNum;
    try {
      const webStream = await originalInfo.download(downloadOptions);
      return Readable.fromWeb(webStream);
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`[JS-YT] Innertube.download failed:`, error.message);
    }
  }

  if (!options._retried) {
     const freshInfo = await getFallbackInfo(`https://www.youtube.com/watch?v=${videoInfo.id}`);
     return getStream(freshInfo, { ...options, _retried: true });
  }
  
  throw new Error("Failed to secure a working audio stream after multiple attempts.");
}

export { getFallbackInfo };
