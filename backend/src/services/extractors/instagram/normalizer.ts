import { VideoInfo, Format } from '../../../types/index.js';
import { RawInstagramData } from './parser.js';

export function normalizeVideoInfo(
  targetUrl: string,
  data: RawInstagramData
): VideoInfo | null {
  if (data.formats.length === 0) return null;

  const finalFormats = data.formats.filter(
    (f: Format) => f.isVideo || f.isMuxed || f.isAudio || f.formatId === 'photo'
  );
  if (finalFormats.length === 0) return null;

  return {
    type: 'video',
    id: data.extractedId,
    extractorKey: 'instagram',
    isJsInfo: true,
    title: data.finalTitle || data.ogTitle || data.title || 'Instagram Media',
    uploader: data.author,
    author: data.author,
    thumbnail: data.thumbnail || '',
    webpageUrl: targetUrl,
    formats: finalFormats,
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isFullData: false,
  };
}
