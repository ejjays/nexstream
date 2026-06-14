import { getProxiedStream } from '../../../utils/network/proxy.util.js';
import { VideoInfo, Format, ExtractorOptions } from '../../../types/index.js';
import { IgParsed } from './types.js';
import { Readable } from 'node:stream';
import { DESKTOP_UA } from './constants.js';
import {
  extractShortcode,
  fetchMobileItem,
  fetchGraphqlMedia,
  fetchEmbedHtml,
  fetchFileSize,
} from './fetcher.js';
import { parseMobileItem, parseGraphqlMedia, parseEmbed } from './parser.js';
import { normalizeVideoInfo } from './normalizer.js';

async function resolveParsed(
  url: string,
  options: ExtractorOptions
): Promise<IgParsed | null> {
  const shortcode = extractShortcode(url);

  // ordered cascade, first with media wins
  const resolvers: Array<() => Promise<IgParsed | null>> = [];
  if (shortcode) {
    resolvers.push(async () =>
      parseMobileItem(await fetchMobileItem(shortcode, options))
    );
    resolvers.push(async () =>
      parseGraphqlMedia(await fetchGraphqlMedia(shortcode, options))
    );
  }
  resolvers.push(async () => {
    const html = await fetchEmbedHtml(url, options);
    return html ? parseEmbed(html) : null;
  });

  for (const resolve of resolvers) {
    try {
      const parsed = await resolve();
      if (parsed && parsed.media.length > 0) return parsed;
    } catch (error: unknown) {
      console.debug(`[JS-IG] path failed: ${(error as Error).message}`);
    }
  }
  return null;
}

export async function getInfo(
  url: string,
  options: ExtractorOptions = {}
): Promise<VideoInfo | null> {
  try {
    const parsed = await resolveParsed(url, options);
    if (!parsed) return null;

    const videoInfo = normalizeVideoInfo(url, parsed);
    if (!videoInfo) return null;

    // sizes are optional, fetch in small batches
    for (let index = 0; index < videoInfo.formats.length; index += 3) {
      const batch = videoInfo.formats.slice(index, index + 3);
      await Promise.all(
        batch.map(async (format: Format) => {
          if (format.url) {
            const size = await fetchFileSize(format.url);
            if (size) format.filesize = size;
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
    getProxiedStream(targetFormat.url, {
      'User-Agent': DESKTOP_UA,
      Referer: 'https://www.instagram.com/',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    })
  );
}
