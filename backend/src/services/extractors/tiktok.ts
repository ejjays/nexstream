import { getQuantumStream } from '../../utils/network/proxy.util.js';
import { VideoInfo, ExtractorOptions } from '../../types/index.js';
import { Readable } from 'node:stream';
import { normalizeTitle, normalizeArtist } from '../social.service.js';

export async function getInfo(
  url: string,
  _options: ExtractorOptions = {}
): Promise<VideoInfo | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
      },
    });
    if (!response.ok) return null;
    const html = await response.text();

    const idMatch = html.match(/"video_id":"(\d+)"/u);
    const videoId = idMatch ? idMatch[1] : null;

    const titleMatch = html.match(/"share_title":"([^"]+)"/u);
    const rawTitle = titleMatch ? titleMatch[1] : 'TikTok Video';

    const authorMatch = html.match(/"author_name":"([^"]+)"/u);
    const rawAuthor = authorMatch ? authorMatch[1] : 'TikTok User';

    const thumbMatch = html.match(/"cover_data":\{"url_list":\["([^"]+)"/u);
    const thumbnail = thumbMatch ? thumbMatch[1].replace(/\\u0026/gu, '&') : '';

    const videoMatch = html.match(/"play_addr":\{"url_list":\["([^"]+)"/u);
    const videoUrl = videoMatch
      ? videoMatch[1].replace(/\\u0026/gu, '&')
      : null;

    if (!videoUrl) return null;

    const info: VideoInfo = {
      type: 'video',
      id: videoId || url,
      title: rawTitle,
      uploader: rawAuthor,
      webpageUrl: response.url,
      thumbnail,
      formats: [
        {
          formatId: 'hd',
          url: videoUrl,
          extension: 'mp4',
          resolution: 'Source',
          acodec: 'aac',
          vcodec: 'h264',
          isAudio: true,
          isVideo: true,
          isMuxed: true,
        },
      ],
      extractorKey: 'tiktok',
      isJsInfo: true,
      fromBrain: false,
      isPartial: false,
      isIsrcMatch: false,
      isFullData: false,
    };

    info.title = normalizeTitle(info as unknown as Record<string, unknown>);
    info.uploader = normalizeArtist(info as unknown as Record<string, unknown>);

    return info;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[JS-TikTok] Error extracting ${url}: ${message}`);
    return null;
  }
}

export function getStream(
  videoInfo: VideoInfo,
  _options: ExtractorOptions = {}
): Promise<Readable> {
  const format = videoInfo.formats[0];
  if (!format?.url) throw new Error('No stream URL found');

  return Promise.resolve(
    getQuantumStream(format.url, {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
      Referer: 'https://www.tiktok.com/',
    })
  );
}
