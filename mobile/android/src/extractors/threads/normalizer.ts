import { VideoInfo, Format } from '../types';
import { normalizeTitle, normalizeArtist } from '../social';
import { ThreadsParsed } from './types';

export function normalizeVideoInfo(
  url: string,
  parsedData: ThreadsParsed | null
): VideoInfo | null {
  if (!parsedData) return null;

  const formats: Format[] = parsedData.formats.map((formatItem, index) => {
    const isPhoto = formatItem.format_id?.startsWith('photo') ?? false;
    const vcodec = formatItem.vcodec ?? (isPhoto ? undefined : 'h264');
    const acodec = formatItem.acodec ?? (isPhoto ? undefined : 'aac');
    const { width, height } = formatItem;

    // label when dimensions are unavailable
    const tier =
      formatItem.format_id === 'hd'
        ? 'HD'
        : formatItem.format_id === 'sd'
          ? 'SD'
          : isPhoto
            ? 'Photo'
            : undefined;

    const quality = height ? `${height}p` : tier;

    return {
      formatId: formatItem.format_id || `th_${index}`,
      url: formatItem.url,
      extension: formatItem.ext ?? 'mp4',
      resolution: width && height ? `${width}x${height}` : (tier ?? 'Source'),
      quality,
      width,
      height,
      vcodec,
      acodec,
      isAudio: Boolean(acodec && acodec !== 'none'),
      isVideo: Boolean(vcodec && vcodec !== 'none'),
      isMuxed: Boolean(
        acodec && acodec !== 'none' && vcodec && vcodec !== 'none'
      ),
    };
  });

  if (formats.length === 0) return null;

  const info: VideoInfo = {
    type: 'video',
    id: parsedData.id || url,
    title: parsedData.title || 'Threads Post',
    uploader: parsedData.uploader || 'Threads User',
    thumbnail: parsedData.thumbnail || undefined,
    webpageUrl: url,
    formats,
    extractorKey: 'threads',
    isJsInfo: true,
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isFullData: false,
  };

  // make caption authoritative over og:title
  if (parsedData.title) {
    info.metascraper = { title: parsedData.title };
  }

  info.title = normalizeTitle(info);
  info.uploader = normalizeArtist(info);

  return info;
}
