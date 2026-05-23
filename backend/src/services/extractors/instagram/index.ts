import { getQuantumStream } from '../../../utils/network/proxy.util.js';
import { VideoInfo, Format, ExtractorOptions } from '../../../types/index.js';
import { Readable } from 'node:stream';
import { fetchJson, fetchEmbed, fetchFileSize } from './fetcher.js';
import { parseJson, parseEmbed } from './parser.js';
import { normalizeVideoInfo } from './normalizer.js';

export async function getInfo(
  url: string,
  options: ExtractorOptions = {}
): Promise<VideoInfo | null> {
  try {
    // try JSON
    let rawData = null;
    const jsonUrl = url.includes('?')
      ? `${url.split('?')[0]}?__a=1&__d=dis`
      : `${url}?__a=1&__d=dis`;
    const jsonData = await fetchJson(jsonUrl, options);
    if (jsonData) {
      rawData = parseJson(jsonData);
    }

    if (!rawData) {
      const embedHtml = await fetchEmbed(url, options);
      if (embedHtml) {
        rawData = parseEmbed(embedHtml);
      }
    }

    if (!rawData) return null;

    const videoInfo = normalizeVideoInfo(url, rawData);
    if (!videoInfo) return null;

    // fetch size
    for (let index = 0; index < videoInfo.formats.length; index += 2) {
      const batch = videoInfo.formats.slice(index, index + 2);
      await Promise.all(
        batch.map(async (formatItem: Format) => {
          if (formatItem.url) {
            const size = await fetchFileSize(formatItem.url);
            if (size) formatItem.filesize = size;
          }
        })
      );
    }

    return videoInfo;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[JS-IG] Error extracting ${url}: ${message}`);
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
      Referer: 'https://www.instagram.com/',
      Accept: '*/*',
    })
  );
}
