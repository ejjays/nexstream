import * as youtube from './youtube.js';
import * as instagram from './instagram.js';
import * as facebook from './facebook.js';
import * as tiktok from './tiktok.js';
import * as spotify from './spotify.js';
import * as soundcloud from './soundcloud.js';
import { isSupportedUrl } from '../../utils/validation.util.js';
import { Extractor, ExtractorOptions } from '../../types/index.js';

export async function getExtractor(url: string): Promise<Extractor | null> {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return youtube as unknown as Extractor;
  if (url.includes('instagram.com')) return instagram as unknown as Extractor;
  if (url.includes('facebook.com') || url.includes('fb.watch')) return facebook as unknown as Extractor;
  if (url.includes('tiktok.com')) return tiktok as unknown as Extractor;
  if (url.includes('spotify.com')) return spotify as unknown as Extractor;
  if (url.includes('soundcloud.com')) return soundcloud as unknown as Extractor;
  return null;
}

export async function getInfo(url: string, options: ExtractorOptions = {}) {
  const extractor = await getExtractor(url);
  if (!extractor) return null;
  
  return await extractor.getInfo(url, options);
}

export function shouldJSStream(url: string, quality: string, format: string) {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
     return false; 
  }

  if (url.includes('facebook.com') || url.includes('instagram.com') || url.includes('tiktok.com') || url.includes('spotify.com') || url.includes('soundcloud.com')) return true;

  if (['mp3', 'm4a', 'audio'].includes(format)) return true;

  const res = parseInt(quality);
  if (!isNaN(res) && res <= 720) return true;

  return false;
}

export {
  youtube,
  instagram,
  facebook,
  tiktok,
  spotify,
  soundcloud
};
