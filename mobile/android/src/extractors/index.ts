import { VideoInfo } from './types';
import { getInfo as facebookGetInfo } from './facebook';
import { getInfo as tiktokGetInfo } from './tiktok';
import { getInfo as xGetInfo } from './x';
import { getInfo as threadsGetInfo } from './threads';
import { getInfo as youtubeGetInfo } from './youtube';

function hostOf(url: string): string {
  const cleaned = url.replace(/^https?:\/\//iu, '');
  return cleaned.split(/[/?#]/u)[0].toLowerCase();
}

function matches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function resolve(url: string): Promise<VideoInfo | null> {
  const host = hostOf(url);

  if (matches(host, 'youtube.com') || matches(host, 'youtu.be')) {
    return youtubeGetInfo(url);
  }

  if (matches(host, 'tiktok.com')) {
    return tiktokGetInfo(url);
  }

  if (matches(host, 'x.com') || matches(host, 'twitter.com')) {
    return xGetInfo(url);
  }

  if (matches(host, 'threads.net') || matches(host, 'threads.com')) {
    return threadsGetInfo(url);
  }

  if (
    matches(host, 'facebook.com') ||
    matches(host, 'fb.watch') ||
    matches(host, 'fb.com')
  ) {
    return facebookGetInfo(url);
  }

  return Promise.resolve(null);
}
