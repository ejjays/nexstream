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

    return {
      formatId: formatItem.format_id || `fb_${bandwidth || Math.random()}`,
      url: formatItem.url,
      extension: formatItem.ext || 'mp4',
      resolution: height ? `${width}x${height}` : 'Source',
      width,
      height,
      filesize: formatItem.filesize,
      acodec: formatItem.acodec,
      vcodec: formatItem.vcodec,
      isAudio: Boolean(formatItem.acodec && formatItem.acodec !== 'none'),
      isVideo: Boolean(formatItem.vcodec && formatItem.vcodec !== 'none'),
      isMuxed: Boolean(
        formatItem.acodec &&
        formatItem.acodec !== 'none' &&
        formatItem.vcodec &&
        formatItem.vcodec !== 'none'
      ),
    };
  });

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
