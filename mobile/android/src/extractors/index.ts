import { VideoInfo } from './types';
import { getInfo as facebookGetInfo } from './facebook';
import { getInfo as tiktokGetInfo } from './tiktok';

export function resolve(url: string): Promise<VideoInfo | null> {
  const lower = url.toLowerCase();

  if (lower.includes('tiktok.com')) {
    return tiktokGetInfo(url);
  }

  if (
    lower.includes('facebook.com') ||
    lower.includes('fb.watch') ||
    lower.includes('fb.com')
  ) {
    return facebookGetInfo(url);
  }

  return Promise.resolve(null);
}
