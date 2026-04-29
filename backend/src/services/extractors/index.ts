import * as youtube from './youtube.js';
import * as instagram from './instagram.js';
import * as facebook from './facebook.js';
import * as tiktok from './tiktok.js';
import * as spotify from './spotify.js';
import * as soundcloud from './soundcloud.js';
import { isSupportedUrl } from '../../utils/validation.util.js';

export async function getExtractor(url: string) {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return youtube;
  if (url.includes('instagram.com')) return instagram;
  if (url.includes('facebook.com') || url.includes('fb.watch')) return facebook;
  if (url.includes('tiktok.com')) return tiktok;
  if (url.includes('spotify.com')) return spotify;
  if (url.includes('soundcloud.com')) return soundcloud;
  return null;
}

export async function getInfo(url: string, options: any = {}) {
  const extractor = await getExtractor(url);
  if (!extractor) return null;
  
  // @ts-ignore
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
