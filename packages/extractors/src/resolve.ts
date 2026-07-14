import { Extractor, VideoInfo } from './types.js';
import { ExtractorEnv, defaultEnv } from './env.js';
import { createXExtractor } from './x.js';
import { createBlueskyExtractor } from './bluesky.js';
import { createVimeoExtractor } from './vimeo.js';

function hostOf(url: string): string {
  const cleaned = url.replace(/^https?:\/\//iu, '');
  return cleaned.split(/[/?#]/u)[0].toLowerCase();
}

function matches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

// host -> extractor, one env shared across whichever extractor gets picked
export function getExtractor(
  url: string,
  env: ExtractorEnv = defaultEnv
): Extractor | null {
  const host = hostOf(url);
  if (matches(host, 'x.com') || matches(host, 'twitter.com')) {
    return createXExtractor(env);
  }
  if (matches(host, 'bsky.app')) {
    return createBlueskyExtractor(env);
  }
  if (matches(host, 'vimeo.com')) {
    return createVimeoExtractor(env);
  }
  return null;
}

// convenience: getExtractor + getInfo in one call, for when you don't need getStream too
export async function resolve(
  url: string,
  env: ExtractorEnv = defaultEnv
): Promise<VideoInfo | null> {
  const extractor = getExtractor(url, env);
  if (!extractor) return null;
  return extractor.getInfo(url);
}
