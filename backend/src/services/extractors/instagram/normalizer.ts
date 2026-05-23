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
    return {
      formatId: formatItem.id || `ig_${Math.random().toString(36).slice(2, 7)}`,
      url: formatItem.video_url || formatItem.display_url,
      extension: 'mp4',
      resolution: formatItem.width
        ? `${formatItem.width}x${formatItem.height}`
        : 'Source',
      width: formatItem.width,
      height: formatItem.height,
      filesize: formatItem.filesize,
      acodec: 'aac',
      vcodec: 'h264',
      isAudio: true,
      isVideo: true,
      isMuxed: true,
    };
  });

  const info: VideoInfo = {
    type: 'video',
    id: parsedData.id || url,
    title: parsedData.title || 'Instagram Video',
    uploader: parsedData.uploader || 'Instagram User',
    webpageUrl: url,
    formats,
    extractorKey: 'instagram',
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
