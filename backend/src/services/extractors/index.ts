import { getInfo as ytGetInfo, getStream as ytGetStream } from './youtube/index.js';
import { getInfo as igGetInfo, getStream as igGetStream } from './instagram/index.js';
import { getInfo as fbGetInfo, getStream as fbGetStream } from './facebook/index.js';
import { getInfo as tkGetInfo, getStream as tkGetStream } from './tiktok.js';
import { getInfo as spGetInfo, getStream as spGetStream } from './spotify.js';
import { getInfo as scGetInfo, getStream as scGetStream } from './soundcloud.js';
import { Extractor, ExtractorOptions, VideoInfo } from '../../types/index.js';
import { fetchMetadata } from '../../utils/media/metadata.util.js';

const youtube: Extractor = { getInfo: ytGetInfo, getStream: ytGetStream };
const instagram: Extractor = { getInfo: igGetInfo, getStream: igGetStream };
const facebook: Extractor = { getInfo: fbGetInfo, getStream: fbGetStream };
const tiktok: Extractor = { getInfo: tkGetInfo, getStream: tkGetStream };
const spotify: Extractor = { getInfo: spGetInfo, getStream: spGetStream };
const soundcloud: Extractor = { getInfo: scGetInfo, getStream: scGetStream };

const genericExtractor: Extractor = {
  getInfo: async (url: string) => {
    const meta = await fetchMetadata(url);
    if (!meta) return null;
    return {
      id: `gen_${Buffer.from(url).toString('base64').substring(0, 10)}`,
      title: meta.title || 'Unknown Video',
      uploader: meta.author || meta.publisher || 'Unknown',
      thumbnail: meta.image || undefined,
      webpage_url: url,
      formats: [],
      metascraper: meta
    } as VideoInfo;
  },
  getStream: () => {
    throw new Error("Streaming not supported for generic URLs. Please provide a supported platform link.");
  }
};

export function getExtractor(url: string): Extractor | null {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return youtube;
  if (url.includes('instagram.com')) return instagram;
  if (url.includes('facebook.com') || url.includes('fb.watch')) return facebook;
  if (url.includes('tiktok.com')) return tiktok;
  if (url.includes('spotify.com')) return spotify;
  if (url.includes('soundcloud.com')) return soundcloud;
  return genericExtractor;
}

export async function getInfo(url: string, options: ExtractorOptions = {}): Promise<VideoInfo | null> {
  const extractor = getExtractor(url);
  if (!extractor) return null;
  
  const fetchMetaPromise = fetchMetadata(url).catch(() => null).then(async (meta) => {
    if (meta && options.onProgress) {
      try {
        const { prepareFinalResponse } = await import('../../utils/api/response.util.js');
        const earlyInfo: VideoInfo = {
          id: `early_${Buffer.from(url).toString('base64').substring(0, 10)}`,
          title: meta.title || 'Unknown Video',
          uploader: meta.author || meta.publisher || 'Unknown',
          thumbnail: meta.image || undefined,
          webpage_url: url,
          formats: [],
          metascraper: meta
        };

        const finalEarlyData = await prepareFinalResponse(earlyInfo, false, null, url);
        finalEarlyData.isPartial = true;
        
        console.log(`[Metadata] Early hit: "${finalEarlyData.title}" by "${finalEarlyData.artist}"`);
        
        options.onProgress('extracting', 45, 'Metadata found', JSON.stringify({
          early_metadata: finalEarlyData
        }));
      } catch (err) {
        console.error('[Metadata] Early dispatch failed:', err);
      }
    }
    return meta;
  });

  const [info, meta] = await Promise.all([
    extractor.getInfo(url, options).catch(() => null),
    fetchMetaPromise
  ]);

  if (!info && !meta) return null;

  const combinedInfo = info || { 
    id: `meta_${Buffer.from(url).toString('base64').substring(0, 10)}`,
    title: meta?.title || 'Unknown Video',
    uploader: meta?.author || meta?.publisher || 'Unknown',
    webpage_url: url,
    formats: [],
    thumbnail: meta?.image || undefined
  } as VideoInfo;

  if (meta) {
    combinedInfo.metascraper = meta;
  }

  return combinedInfo;
}

export function shouldJSStream(url: string, quality: string, format: string) {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
     return false; 
  }

  if (url.includes('facebook.com') || url.includes('instagram.com') || url.includes('spotify.com') || url.includes('soundcloud.com')) return true;

  if (url.includes('tiktok.com')) return false; // download issues

  if (['mp3', 'm4a', 'audio'].includes(format)) return true;

  const res = parseInt(quality);
  return !isNaN(res) && res <= 720;
}

export {
  youtube,
  instagram,
  facebook,
  tiktok,
  spotify,
  soundcloud
};
