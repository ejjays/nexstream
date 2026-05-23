import { VideoInfo, Format } from '../../../types/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizeVideoInfo(url: string, basicInfo: any): VideoInfo {
  const basic = basicInfo.basic_info;
  const streamingData = basicInfo.streaming_data;

  const rawFormats = (streamingData?.formats || []) as any[];
  const adaptiveFormats = (streamingData?.adaptive_formats || []) as any[];

  const formats: Format[] = rawFormats
    .concat(adaptiveFormats)
    .map((formatItem) => {
      const isAudio = Boolean(
        formatItem.mime_type?.includes('audio') || !formatItem.width
      );
      const isVideo = Boolean(formatItem.width && formatItem.height);

      return {
        formatId: String(formatItem.itag),
        url: formatItem.url || formatItem.signature_cipher || formatItem.cipher,
        extension: formatItem.mime_type?.includes('webm') ? 'webm' : 'mp4',
        resolution: formatItem.quality_label || (isAudio ? 'Audio' : 'Source'),
        width: formatItem.width,
        height: formatItem.height,
        filesize: parseInt(formatItem.content_length || '0', 10),
        acodec: formatItem.audio_quality || (isAudio ? 'aac' : 'none'),
        vcodec: formatItem.video_codec || (isVideo ? 'h264' : 'none'),
        isAudio,
        isVideo,
        isMuxed: Boolean(isAudio && isVideo),
      };
    });

  return {
    type: 'video',
    id: basic.id,
    title: basic.title,
    uploader: basic.author,
    author: basic.author,
    thumbnail: basic.thumbnail?.[0]?.url || '',
    webpageUrl: url,
    duration: basic.duration || 0,
    formats,
    extractorKey: 'youtube',
    isJsInfo: true,
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isFullData: false,
  };
}
