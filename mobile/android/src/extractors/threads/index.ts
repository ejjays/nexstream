import { VideoInfo, Format, ExtractorOptions } from '../types';
import { fetchHtml, fetchEmbed, fetchFileSize } from './fetcher';
import { parseHtml } from './parser';
import { normalizeVideoInfo } from './normalizer';

function extract(html: string, targetUrl: string): VideoInfo | null {
  return normalizeVideoInfo(targetUrl, parseHtml(html, targetUrl));
}

export async function getInfo(
  url: string,
  options: ExtractorOptions = {}
): Promise<VideoInfo | null> {
  try {
    const primary = await fetchHtml(url, options);
    let videoInfo = primary ? extract(primary.html, primary.targetUrl) : null;

    // walled/empty page: try public embed
    if (!videoInfo || videoInfo.formats.length === 0) {
      const embed = await fetchEmbed(url, options);
      const alt = embed ? extract(embed.html, embed.targetUrl) : null;
      if (alt && alt.formats.length > 0) videoInfo = alt;
    }

    if (!videoInfo || videoInfo.formats.length === 0) return null;

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
    console.error(`[JS-Threads] Error extracting ${url}: ${message}`);
    return null;
  }
}
