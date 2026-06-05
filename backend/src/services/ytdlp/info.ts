import { isSupportedUrl } from '../../utils/network/validation.util.js';
import * as Sentry from '@sentry/node'; // skipcq: JS-C1003
import { normalizeUrl } from '../../utils/media/video.util.js';
import { VideoInfo } from '../../types/index.js';
import { getTraceId } from '../../utils/infra/trace.util.js';
import {
  reportProgress,
  getCachedInfo,
  setCachedInfo,
  ensureNormalizedFormats,
  expandShortUrl,
  runYtdlpInfo,
  prefetchPromises,
} from './info-core.js';
import { handleSpotifyInfo } from './info-spotify.js';
import { handleYoutubeTiktokInfo, handleSocialJSInfo } from './info-youtube.js';
import { secureFetch } from '../../utils/network/security.util.js';

// keep public API stable for consumers
export { expandShortUrl, runYtdlpInfo } from './info-core.js';

// native extractors that shouldn't need yt-dlp
export function nativePlatform(url: string): string | null {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('tiktok.com')) return 'TikTok';
  if (url.includes('facebook.com') || url.includes('fb.watch'))
    return 'Facebook';
  if (url.includes('instagram.com')) return 'Instagram';
  if (url.includes('soundcloud.com')) return 'SoundCloud';
  return null;
}

// delegate blocked hosts to a clean-ip peer
const PEER_RESOLVER_URL = process.env.PEER_RESOLVER_URL?.trim() || '';
const PEER_HOSTS = (process.env.PEER_RESOLVE_HOSTS || '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

function shouldPeerResolve(url: string): boolean {
  if (!PEER_RESOLVER_URL || PEER_HOSTS.length === 0) return false;
  const lower = url.toLowerCase();
  return PEER_HOSTS.some((host) => lower.includes(host));
}

// peer resolves with a non-blocked ip
async function tryPeerResolve(
  url: string,
  clientId: string | null
): Promise<VideoInfo | null> {
  if (!shouldPeerResolve(url)) return null;
  const base = PEER_RESOLVER_URL.replace(/\/+$/u, '');
  const endpoint = `${base}/info?url=${encodeURIComponent(url)}&id=${clientId || 'peer'}`;
  try {
    const res = await secureFetch(endpoint, {
      signal: AbortSignal.timeout(35000),
    });
    if (!res.ok) {
      console.warn(`[Peer] resolve failed: HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as VideoInfo;
    // reject empty peer results
    if (data?.formats?.length || data?.title) return data;
    return null;
  } catch (error) {
    console.warn(`[Peer] resolve error: ${(error as Error).message}`);
    return null;
  }
}

// keep peer warm to avoid cold-start
export function startPeerKeepWarm(): void {
  if (!PEER_RESOLVER_URL || process.env.NODE_ENV === 'test') return;
  const base = PEER_RESOLVER_URL.replace(/\/+$/u, '');
  const ping = (): void => {
    secureFetch(`${base}/health`, {
      signal: AbortSignal.timeout(10000),
    }).catch(() => undefined);
  };
  ping();
  setInterval(ping, 4 * 60 * 1000).unref();
  console.log(`[Peer] keep-warm enabled for ${base}`);
}

const _handleUrlDecoding = (url: string) => {
  let decodedUrl = normalizeUrl(url);
  if (decodedUrl.includes('http') && decodedUrl.lastIndexOf('http') > 0) {
    decodedUrl = decodedUrl.substring(decodedUrl.lastIndexOf('http'));
    console.log(`[Info] Fixed double-pasted URL: ${decodedUrl}`);
  }
  return decodedUrl;
};

async function _expandIfShortLink(url: string, clientId: string | null) {
  const needsExpansion =
    url.includes('bili.im') ||
    url.includes('fb.watch') ||
    url.includes('fb.gg') ||
    url.includes('youtu.be') ||
    url.includes('share/') ||
    url.includes('vt.tiktok.com') ||
    url.includes('on.soundcloud.com');

  if (needsExpansion) {
    console.log('[Info] Expanding URL:', url);
    reportProgress(
      clientId,
      'initializing',
      12,
      'Expanding short-links...',
      'NETWORK: RESOLVING_REDIRECTS'
    );
    return await expandShortUrl(url);
  }
  return _handleUrlDecoding(url);
}

async function _syncPrefetch(cacheKey: string, clientId: string | null) {
  if (prefetchPromises.has(cacheKey)) {
    reportProgress(
      clientId,
      'initializing',
      15,
      'Syncing with uplink...',
      'CACHE: AWAITING_PREFETCH_COMPLETION'
    );
    const prefetchResult = await prefetchPromises.get(cacheKey);
    if (prefetchResult) return prefetchResult;
  }
  return null;
}

export async function getVideoInfo(
  url: string,
  cookieArgs: string[] = [],
  forceRefresh = false,
  signal: AbortSignal | null = null,
  clientId: string | null = null
): Promise<VideoInfo> {
  const tid = getTraceId() || 'global';
  const t0 = Date.now();
  console.log(`[Info] [${tid}] Starting getVideoInfo for:`, url);
  if (!isSupportedUrl(url)) throw new Error('Unsupported or malicious URL');

  const onProgress = (
    status: string,
    progress: number,
    subStatus?: string,
    details?: string
  ) => {
    console.log('[Info] Progress:', status, subStatus);
    reportProgress(clientId, status, progress, subStatus, details);
  };

  const targetUrl = await _expandIfShortLink(url, clientId);
  console.log(`[Info] Resolved URL: ${targetUrl} (T+${Date.now() - t0}ms)`);

  const cacheKey = `${targetUrl}_${cookieArgs.join('_')}`;

  const prefetchResult = await _syncPrefetch(cacheKey, clientId);
  if (prefetchResult) {
    console.log(`[Timing] /info served from prefetch in ${Date.now() - t0}ms`);
    return prefetchResult;
  }

  // check cache
  const cached = await getCachedInfo(cacheKey, forceRefresh, clientId);
  if (cached) {
    console.log(`[Timing] /info served from cache in ${Date.now() - t0}ms`);
    return cached;
  }

  // delegate blocked hosts to the peer resolver
  if (!forceRefresh) {
    const peerInfo = await tryPeerResolve(targetUrl, clientId);
    if (peerInfo) {
      await setCachedInfo(cacheKey, peerInfo);
      console.log(`[Timing] /info via peer in ${Date.now() - t0}ms`);
      return peerInfo;
    }
  }

  // handle spotify
  if (targetUrl.includes('spotify.com') && !forceRefresh) {
    return handleSpotifyInfo(targetUrl, cacheKey, clientId, onProgress);
  }

  const isYouTube =
    targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be');

  // handle yt/tiktok
  if ((isYouTube || targetUrl.includes('tiktok.com')) && !forceRefresh) {
    const jsInfo = await handleYoutubeTiktokInfo(
      targetUrl,
      cacheKey,
      cookieArgs,
      clientId,
      onProgress,
      t0
    );
    if (jsInfo) {
      console.log(
        `[Timing] /info handleYoutubeTiktokInfo returned in ${Date.now() - t0}ms (isPartial=${jsInfo.isPartial})`
      );
      return jsInfo;
    }
  }

  // handle social
  if (!isYouTube) {
    const socialInfo = await handleSocialJSInfo(
      targetUrl,
      cacheKey,
      cookieArgs,
      onProgress
    );
    if (socialInfo) {
      console.log(
        `[Timing] /info handleSocialJSInfo returned in ${Date.now() - t0}ms`
      );
      return socialInfo;
    }
  }

  // fallback ytdlp
  const isFbStory = targetUrl.includes('/stories/');
  if (isFbStory) throw new Error('Could not extract Facebook Story media.');

  console.log('[Info] Falling back to slow-path (yt-dlp)...');

  // native extractor yielded nothing (drift)
  const degraded = nativePlatform(targetUrl);
  if (degraded) {
    Sentry.captureMessage(
      `[Degradation] ${degraded} pure-JS yielded no formats; using yt-dlp fallback`,
      { level: 'warning', tags: { platform: degraded } }
    );
  }
  reportProgress(
    clientId,
    'fetching_info',
    15,
    'Falling back to deep-scan...',
    'PROCESS: SPAWNING_YTDLP_FALLBACK'
  );

  const info = await runYtdlpInfo(targetUrl, cookieArgs, signal);

  // ensure frontend sync
  info.isPartial = false;
  info.isFullData = true;
  if (!info.extractorKey) info.extractorKey = 'youtube';

  ensureNormalizedFormats(info);

  await setCachedInfo(cacheKey, info);
  console.log(
    `[Timing] /info served from yt-dlp slow-path in ${Date.now() - t0}ms`
  );
  return info;
}

const _getEmeStatusFromSubStatus = (subStatus?: string) => {
  let statusStr = 'EME_PROCESSING';
  if (subStatus?.includes('Booting')) statusStr = 'EME_LOAD_WASM';
  if (subStatus?.includes('Negotiating')) statusStr = 'EME_HANDSHAKE';
  if (subStatus?.includes('Video Buffer')) statusStr = 'EME_FETCH_VIDEO';
  if (subStatus?.includes('Audio Buffer')) statusStr = 'EME_FETCH_AUDIO';
  if (subStatus?.includes('Interleaving')) statusStr = 'EME_STITCHING';
  if (subStatus?.includes('Success')) statusStr = 'EME_COMPLETED';
  return statusStr;
};

export const getEmeStatus = (status: string, subStatus?: string) => {
  if (status !== 'eme_downloading') return status;
  return _getEmeStatusFromSubStatus(subStatus);
};

export async function cacheVideoInfo(
  url: string,
  data: VideoInfo,
  cookieArgs: string[] = []
): Promise<void> {
  const targetUrl = normalizeUrl(url);
  await setCachedInfo(`${targetUrl}_${cookieArgs.join('_')}`, data);
}
