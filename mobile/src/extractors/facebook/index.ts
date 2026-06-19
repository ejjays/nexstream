import { VideoInfo, Format, ExtractorOptions } from '../types';
import { fetchHtml, fetchFileSize } from './fetcher';
import { parseHtml } from './parser';
import { normalizeVideoInfo } from './normalizer';

export async function getInfo(
  url: string,
  _options: ExtractorOptions = {}
): Promise<VideoInfo | null> {
  try {
    const fetchResult = await fetchHtml(url, _options);
    if (!fetchResult) return null;

    const { html, targetUrl } = fetchResult;

    const parsedData = parseHtml(html, targetUrl);

    let videoInfo = normalizeVideoInfo(targetUrl, parsedData);
    if (!videoInfo) return null;

    // recover title if still generic
    for (
      let attempt = 0;
      attempt < 1 && videoInfo.title === videoInfo.uploader;
      attempt += 1
    ) {
      const retry = await fetchHtml(url, _options, 2500).catch(() => null);
      const alt = retry
        ? normalizeVideoInfo(
            retry.targetUrl,
            parseHtml(retry.html, retry.targetUrl)
          )
        : null;
      if (!alt || alt.formats.length === 0) break;
      videoInfo = alt;
    }

    // fetch size
    for (let i = 0; i < videoInfo.formats.length; i += 3) {
      const batch = videoInfo.formats.slice(i, i + 3);
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
    console.error(`[JS-FB] Error extracting ${url}: ${message}`);
    return null;
  }
}
