import { VideoInfo, Format } from '../../../types/index.js';
import { RawFacebookData } from './parser.js';

export function normalizeVideoInfo(
  targetUrl: string,
  data: RawFacebookData
): VideoInfo | null {
  if (data.formats.length === 0) return null;

  const finalFormats = data.formats.filter(
    (f: Format) => f.isVideo || f.isMuxed || f.isAudio || f.formatId === 'photo'
  );
  if (finalFormats.length === 0) return null;

  return {
    type: 'video',
    id: data.extractedId,
    extractorKey: 'facebook',
    isJsInfo: true,
    title: data.finalTitle || data.ogTitle,
    uploader: data.author,
    author: data.author,
    description: data.finalTitle || data.ogDesc || data.ogTitle,
    thumbnail: data.thumbnail || '',
    webpageUrl: targetUrl,
    formats: finalFormats,
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isFullData: false,
  };
}
