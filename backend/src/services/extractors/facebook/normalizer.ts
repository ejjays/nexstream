import { VideoInfo } from '../../../types/index.js';
import { normalizeTitle, normalizeArtist } from '../../social.service.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizeVideoInfo(
  url: string,
  parsedData: any
): VideoInfo | null {
  if (!parsedData) return null;

  const rawFormats = (parsedData.formats || []) as any[];
  const formats = rawFormats.map((formatItem) => {
    const bandwidth = formatItem.bandwidth || formatItem.bitrate;
    const height = formatItem.height;
    const width = formatItem.width;

    const vcodec = formatItem.vcodec || (formatItem.ext === 'mp4' ? 'h264' : undefined);
    const acodec = formatItem.acodec || (formatItem.ext === 'mp4' || formatItem.ext === 'm4a' ? 'aac' : undefined);

    return {
      formatId: formatItem.format_id || `fb_${bandwidth || Math.random()}`,
      url: formatItem.url,
      extension: formatItem.ext || 'mp4',
      resolution: height ? `${width}x${height}` : 'Source',
      width,
      height,
      filesize: formatItem.filesize,
      acodec,
      vcodec,
      isAudio: Boolean(acodec && acodec !== 'none'),
      isVideo: Boolean(vcodec && vcodec !== 'none'),
      isMuxed: Boolean(
        acodec &&
        acodec !== 'none' &&
        vcodec &&
        vcodec !== 'none'
      ),
    };
  });

  if (formats.length === 0) return null;

  const info: VideoInfo = {
    type: 'video',
    id: parsedData.id || url,
    title: parsedData.title || 'Facebook Video',
    uploader: parsedData.uploader || 'Facebook User',
    webpageUrl: url,
    formats,
    extractorKey: 'facebook',
    isJsInfo: true,
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isFullData: false,
  };

  info.title = normalizeTitle(info as unknown as Record<string, unknown>);
  info.uploader = normalizeArtist(info as unknown as Record<string, unknown>);

  return info;
}
