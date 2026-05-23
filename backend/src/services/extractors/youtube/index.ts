import { getQuantumStream } from '../../../utils/network/proxy.util.js';
import { VideoInfo, Format, ExtractorOptions } from '../../../types/index.js';
import { Readable } from 'node:stream';
import { getYoutubeClient } from './client.js';
import { normalizeVideoInfo } from './normalizer.js';

export async function getInfo(
  url: string,
  options: ExtractorOptions = {}
): Promise<VideoInfo | null> {
  try {
    const client = await getYoutubeClient();
    const idMatch = url.match(
      /(?:v=|\/v\/|youtu\.be\/|shorts\/|live\/)([0-9A-Za-z_-]{11})/u
    );
    const videoId = idMatch ? idMatch[1] : url;

    const basicInfo = await client.getBasicInfo(videoId);
    const videoInfo = normalizeVideoInfo(url, basicInfo);

    if (options.onProgress) {
      options.onProgress('fetching_info', 50, 'Metadata parsed');
    }

    return videoInfo;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[JS-YT] Error extracting ${url}: ${message}`);
    return null;
  }
}

export function getStream(
  videoInfo: VideoInfo,
  options: ExtractorOptions = {}
): Promise<Readable> {
  const targetFormat =
    videoInfo.formats.find(
      (formatItem: Format) =>
        String(formatItem.formatId) === String(options.formatId)
    ) || videoInfo.formats[0];
  if (!targetFormat?.url) throw new Error('No stream URL found');

  return Promise.resolve(
    getQuantumStream(targetFormat.url, {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://www.youtube.com/',
    })
  );
}
