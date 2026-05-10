import { getInfo as ytGetInfo, getStream as ytGetStream } from './youtube/index.js';
import { getInfo as igGetInfo, getStream as igGetStream } from './instagram/index.js';
import { getInfo as fbGetInfo, getStream as fbGetStream } from './facebook/index.js';
import { getInfo as tkGetInfo, getStream as tkGetStream } from './tiktok.js';
import { getInfo as spGetInfo, getStream as spGetStream } from './spotify.js';
import { getInfo as scGetInfo, getStream as scGetStream } from './soundcloud.js';
import { Extractor, ExtractorOptions } from '../../types/index.js';

const youtube: Extractor = { getInfo: ytGetInfo, getStream: ytGetStream };
const instagram: Extractor = { getInfo: igGetInfo, getStream: igGetStream };
const facebook: Extractor = { getInfo: fbGetInfo, getStream: fbGetStream };
const tiktok: Extractor = { getInfo: tkGetInfo, getStream: tkGetStream };
const spotify: Extractor = { getInfo: spGetInfo, getStream: spGetStream };
const soundcloud: Extractor = { getInfo: scGetInfo, getStream: scGetStream };

export function getExtractor(url: string): Extractor | null {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return youtube;
  if (url.includes('instagram.com')) return instagram;
  if (url.includes('facebook.com') || url.includes('fb.watch')) return facebook;
  if (url.includes('tiktok.com')) return tiktok;
  if (url.includes('spotify.com')) return spotify;
  if (url.includes('soundcloud.com')) return soundcloud;
  return null;
}

export async function getInfo(url: string, options: ExtractorOptions = {}) {
  const extractor = getExtractor(url);
  if (!extractor) return null;
  
  return await extractor.getInfo(url, options);
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
