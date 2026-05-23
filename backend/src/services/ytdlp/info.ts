import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { COMMON_ARGS, CACHE_DIR, USER_AGENT, REFERER_MAP } from './config.js';
import { isSupportedUrl } from '../../utils/network/validation.util.js';
import { normalizeUrl } from '../../utils/media/video.util.js';
import { sendEvent } from '../../utils/network/sse.util.js';
import {
  VideoInfo,
  Format,
  SpotifyMetadata,
  SSEEvent,
} from '../../types/index.js';
import { getTraceId } from '../../utils/infra/trace.util.js';

type ProgressCallback = (
  status: string,
  progress: number,
  subStatus?: string,
  details?: string
) => void;

import { createRedisClient } from '../../utils/infra/redis.util.js';

const redis = createRedisClient('MetadataCache');
const metadataCache = new Map<string, { data: VideoInfo; timestamp: number }>();
const prefetchPromises = new Map<string, Promise<VideoInfo | undefined>>();
const METADATA_EXPIRY = 7200000; // 2 hours

// report progress
function reportProgress(
  clientId: string | null,
  status: string,
  progress: number,
  subStatus?: string,
  details?: string
) {
  if (!clientId) return;

  const event: SSEEvent = {
    status: (status === 'fetching_info'
      ? 'initializing'
      : status) as SSEEvent['status'],
    progress,
    subStatus: subStatus || 'Analysing...',
    details,
  };

  // early metadata dispatch
  if (details?.includes('early_metadata')) {
    try {
      const parsed = JSON.parse(details);
      if (parsed.early_metadata) {
        event.metadata_update = {
          ...parsed.early_metadata,
          isPartial: true,
        };
        // update status
        event.subStatus = 'Metadata found!';
      }
    } catch (_e) {
      // ignore invalid JSON
    }
  }

  sendEvent(clientId, event);
}

// check cache
async function getCachedInfo(
  cacheKey: string,
  forceRefresh: boolean,
  clientId: string | null
): Promise<VideoInfo | null> {
  // check L1
  const cachedL1 = metadataCache.get(cacheKey);
  if (cachedL1 && !forceRefresh && Date.now() - cachedL1.timestamp < 5000) {
    return cachedL1.data;
  }

  // check Redis
  if (!forceRefresh) {
    try {
      const cachedRedis = await redis.get(`meta:${cacheKey}`);
      if (cachedRedis) {
        const data = JSON.parse(cachedRedis) as VideoInfo;
        metadataCache.set(cacheKey, { data, timestamp: Date.now() });
        reportProgress(
          clientId,
          'initializing',
          28,
          'Cache Hit!',
          'REGISTRY: RETRIEVING_PERSISTENT_METADATA'
        );
        return data;
      }
    } catch (e) {
      console.warn('[Info] Redis cache fetch failed:', (e as Error).message);
    }
  }
  return null;
}

async function setCachedInfo(cacheKey: string, data: VideoInfo) {
  metadataCache.set(cacheKey, { data, timestamp: Date.now() });
  try {
    await redis.set(
      `meta:${cacheKey}`,
      JSON.stringify(data),
      'PX',
      METADATA_EXPIRY
    );
  } catch (e) {
    console.warn('[Info] Redis cache save failed:', (e as Error).message);
  }
}

export async function expandShortUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });
    return res.url || url;
  } catch (_err) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'follow',
      });
      return res.url || url;
    } catch (_err2) {
      return url;
    }
  }
}

function runYtdlpInfo(
  targetUrl: string,
  cookieArgs: string[],
  signal: AbortSignal | null = null
): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    const referer =
      Object.entries(REFERER_MAP).find(([domain]) =>
        targetUrl.includes(domain)
      )?.[1] || '';
    const args = [
      ...cookieArgs,
      '--dump-json',
      '--user-agent',
      USER_AGENT,
      ...COMMON_ARGS,
      '--cache-dir',
      CACHE_DIR,
    ];
    if (referer) args.push('--referer', referer);
    args.push(targetUrl);

    const proc = spawn('yt-dlp', args, { detached: true });

    if (signal) {
      const abortHandler = () => {
        if (proc.pid && proc.exitCode === null) {
          try {
            process.kill(-proc.pid, 'SIGKILL');
          } catch {
            /* ignore */
          }
        }
        reject(new Error('Process Aborted'));
      };
      signal.addEventListener('abort', abortHandler, { once: true });
      proc.on('close', () => signal.removeEventListener('abort', abortHandler));
    }

    let stdout = '',
      stderr = '';
    proc.stdout.on('data', (d) => {
      stdout += d;
    });
    proc.stderr.on('data', (d) => {
      stderr += d;
    });
    proc.on('close', (code) => {
      let parsedData: VideoInfo | null = null;
      if (stdout.trim()) {
        try {
          parsedData = JSON.parse(stdout) as VideoInfo;
        } catch (e: unknown) {
          const err = e as Error;
          console.debug('[YtdlpInfo] JSON parse error:', err.message);
        }
      }
      if (code !== 0 && code !== null) {
        console.error(`[yt-dlp-error] Code ${code}: ${stderr.trim()}`);
        if (!parsedData || !parsedData.title) {
          reject(new Error(stderr || 'yt-dlp failed'));
          return;
        }
      }
      if (!parsedData) {
        reject(new Error('yt-dlp returned no valid JSON'));
        return;
      }

      // handle IG wall
      if (parsedData.title?.includes('Welcome back to Instagram')) {
        reject(new Error('Instagram Login Wall detected in yt-dlp'));
        return;
      }

      resolve(parsedData);
    });
  });
}

// handle spotify
async function handleSpotifyInfo(
  targetUrl: string,
  cacheKey: string,
  clientId: string | null,
  onProgress: ProgressCallback
): Promise<VideoInfo> {
  const { fetchInitialMetadata } = await import('../spotify/metadata.js');
  const spotifyIdx = (await import('../spotify/index.js')) as {
    refreshPreviewIfNeeded?: (
      url: string,
      data: VideoInfo | SpotifyMetadata,
      onProgress: ProgressCallback
    ) => Promise<void>;
  };
  const { getFromBrain } = await import('../spotify/brain.js');

  const cachedBrain = (await getFromBrain(targetUrl)) as
    | (VideoInfo & { youtubeUrl?: string })
    | null;
  if (cachedBrain?.formats) {
    try {
      const brainData = {
        ...cachedBrain,
        imageUrl: cachedBrain.imageUrl || '/logo.webp',
        formats:
          typeof cachedBrain.formats === 'string'
            ? JSON.parse(cachedBrain.formats)
            : cachedBrain.formats,
        audioFormats:
          typeof cachedBrain.audioFormats === 'string'
            ? JSON.parse(cachedBrain.audioFormats)
            : cachedBrain.audioFormats,
        audioFeatures:
          typeof cachedBrain.audioFeatures === 'string'
            ? JSON.parse(cachedBrain.audioFeatures as string)
            : cachedBrain.audioFeatures,
        targetUrl: cachedBrain.targetUrl || cachedBrain.youtubeUrl || targetUrl,
        fromBrain: true,
      };

      if (brainData.formats.length > 0 && brainData.targetUrl) {
        if (clientId)
          sendEvent(clientId, { text: 'registry hit', status: 'success' });

        const preview = brainData.previewUrl;
        const isExpiringCDN =
          !preview ||
          preview.includes('scdn.co') ||
          preview.includes('spotify') ||
          preview.includes('dzcdn.net') ||
          preview.includes('mzstatic.com') ||
          preview.includes('itunes.apple.com');

        if (isExpiringCDN && spotifyIdx.refreshPreviewIfNeeded) {
          await spotifyIdx
            .refreshPreviewIfNeeded(targetUrl, brainData, onProgress)
            .catch(() => {
              /* ignore */
            });
        }

        return {
          ...brainData,
          uploader: brainData.artist || 'Unknown',
          webpageUrl: targetUrl,
          previewUrl: brainData.previewUrl,
          cover: brainData.imageUrl,
          thumbnail: brainData.imageUrl || '/logo.webp',
          duration: brainData.duration ? brainData.duration / 1000 : 0,
          extractorKey: 'spotify',
          isPartial: false,
        } as VideoInfo;
      }
    } catch (e: unknown) {
      const err = e as Error;
      console.warn('[Info] [Speed] Failed to parse brain data:', err.message);
    }
  }

  const { metadata } = (await fetchInitialMetadata(
    targetUrl,
    onProgress,
    Date.now()
  )) as { metadata: SpotifyMetadata };

  if (spotifyIdx.refreshPreviewIfNeeded) {
    await spotifyIdx
      .refreshPreviewIfNeeded(targetUrl, metadata, onProgress)
      .catch(() => {
        /* ignore */
      });
  }

  const resolutionPromise = (async () => {
    try {
      const { runPriorityRace } = await import('../spotify/resolver.js');
      const bestMatch = (await runPriorityRace(
        targetUrl,
        {
          ...metadata,
          duration: metadata.duration || 0,
        },
        [],
        onProgress
      )) as { url: string; type?: string };

      if (bestMatch?.url) {
        const matchType = bestMatch.type || 'UNKNOWN';
        const { getInfo } = await import('../extractors/index.js');
        const ytInfo = await getInfo(bestMatch.url);
        if (!ytInfo) throw new Error('Failed to fetch match information.');

        const { prepareFinalResponse } =
          await import('../../utils/api/response.util.js');
        const finalData = (await prepareFinalResponse(
          ytInfo,
          true,
          metadata,
          targetUrl
        )) as VideoInfo;
        finalData.targetUrl = bestMatch.url;

        finalData.isJsInfo = true;
        finalData.imageUrl = metadata.imageUrl;
        finalData.isIsrcMatch = Boolean(
          matchType === 'ISRC' || matchType === 'Soundcharts'
        );
        finalData.isrc = metadata.isrc;
        finalData.webpageUrl = targetUrl;

        const ssePayload: SSEEvent = {
          status: 'success',
          text: 'Resolution complete.',
          metadata_update: {
            ...finalData,
            isFullData: true,
            isPartial: false,
          },
        };

        await new Promise((r) => setTimeout(r, 500));
        await setCachedInfo(cacheKey, finalData);
        if (clientId) sendEvent(clientId, ssePayload);

        const { saveToBrain } = await import('../spotify.service.js');
        saveToBrain(targetUrl, finalData as unknown as SpotifyMetadata);

        return finalData;
      }
      return null;
    } catch (e: unknown) {
      const err = e as Error;
      console.warn('[Info] [Speed] Background resolution failed:', err.message);
      return null;
    } finally {
      prefetchPromises.delete(cacheKey);
    }
  })();

  prefetchPromises.set(
    cacheKey,
    resolutionPromise as Promise<VideoInfo | undefined>
  );

  return {
    ...metadata,
    type: 'video',
    id: targetUrl,
    title: metadata.title || 'Unknown',
    uploader: metadata.artist || 'Unknown',
    webpageUrl: targetUrl,
    cover: metadata.imageUrl,
    thumbnail: metadata.imageUrl,
    extractorKey: 'spotify',
    formats: [],
    isPartial: true,
    fromBrain: false,
    isIsrcMatch: false,
    isJsInfo: true,
    isFullData: false,
  } as VideoInfo;
}

// handle yt/tiktok
async function handleYoutubeTiktokInfo(
  targetUrl: string,
  cacheKey: string,
  cookieArgs: string[],
  clientId: string | null,
  onProgress: ProgressCallback
): Promise<VideoInfo | null> {
  try {
    const { getInfo } = await import('../extractors/index.js');
    const jsInfo = (await getInfo(targetUrl, { onProgress })) as VideoInfo;
    if (jsInfo?.formats && jsInfo.formats.length > 0) {
      await setCachedInfo(cacheKey, jsInfo);

      const prefetch = (async () => {
        try {
          const prefetchUrl = jsInfo.targetUrl || jsInfo.targetUrl || targetUrl;
          const fullInfo = await runYtdlpInfo(prefetchUrl, cookieArgs);

          fullInfo.isJsInfo = true;
          fullInfo.extractorKey = targetUrl.includes('tiktok.com')
            ? 'tiktok'
            : 'youtube';

          const infoJsonDir = path.join(CACHE_DIR, 'metadata');
          if (!fs.existsSync(infoJsonDir))
            fs.mkdirSync(infoJsonDir, { recursive: true });
          const infoJsonPath = path.join(infoJsonDir, `${fullInfo.id}.json`);
          fs.writeFileSync(infoJsonPath, JSON.stringify(fullInfo));
          fullInfo.originalInfo = infoJsonPath;

          await setCachedInfo(cacheKey, fullInfo);

          // async push
          if (clientId) {
            (async () => {
              const { prepareFinalResponse } =
                await import('../../utils/api/response.util.js');
              const finalData = (await prepareFinalResponse(
                fullInfo,
                false,
                null,
                targetUrl
              )) as VideoInfo;
              sendEvent(clientId, {
                status: 'success',
                text: 'Resolution complete.',
                metadata_update: {
                  ...finalData,
                  isFullData: true,
                  isPartial: false,
                },
              });
              return;
            })().catch((e) => console.error('[SSE] Failed to push update:', e));
          }
          return fullInfo;
        } catch (e: unknown) {
          const err = e as Error;
          console.warn('[Prefetch] Background warm-up failed:', err.message);
          return null;
        } finally {
          prefetchPromises.delete(cacheKey);
        }
      })();

      prefetchPromises.set(
        cacheKey,
        prefetch as Promise<VideoInfo | undefined>
      );

      const { prepareFinalResponse } =
        await import('../../utils/api/response.util.js');

      const needsSize =
        !jsInfo.formats[0]?.filesize || jsInfo.formats[0].filesize === 0;
      if (needsSize) {
        await Promise.race([prefetch, new Promise((r) => setTimeout(r, 300))]);
        const updated = metadataCache.get(cacheKey);
        if (updated && updated.data.formats?.[0]?.filesize) {
          return (await prepareFinalResponse(
            updated.data,
            false,
            null,
            targetUrl
          )) as VideoInfo;
        }
      }

      return (await prepareFinalResponse(
        jsInfo,
        false,
        null,
        targetUrl
      )) as VideoInfo;
    }
  } catch (e: unknown) {
    const err = e as Error;
    console.warn(
      `[Metadata] Engine: Pure-JS URL: ${targetUrl} (Failed: ${err.message})`
    );
  }
  return null;
}

function extractCookiesFromFile(cookieArgs: string[]): string | undefined {
  if (cookieArgs.includes('--cookies')) {
    const cookiePath = cookieArgs[cookieArgs.indexOf('--cookies') + 1];
    if (cookiePath && fs.existsSync(cookiePath)) {
      const content = fs.readFileSync(cookiePath, 'utf8');
      const lines = content.split('\n');
      const pairs: string[] = [];
      for (const line of lines) {
        if (!line.trim() || line.startsWith('#')) continue;
        const parts = line.split('\t');
        if (parts.length >= 7)
          pairs.push(`${parts[5].trim()}=${parts[6].trim()}`);
      }
      return pairs.join('; ');
    }
  }
  return undefined;
}

// handle social
async function handleSocialJSInfo(
  targetUrl: string,
  cacheKey: string,
  cookieArgs: string[],
  onProgress: ProgressCallback
): Promise<VideoInfo | null> {
  const isSocial =
    targetUrl.includes('facebook.com') ||
    targetUrl.includes('instagram.com') ||
    targetUrl.includes('tiktok.com');
  const platform = targetUrl.includes('facebook.com')
    ? 'Facebook'
    : targetUrl.includes('instagram.com')
      ? 'Instagram'
      : targetUrl.includes('tiktok.com')
        ? 'TikTok'
        : 'Social';

  try {
    const rawCookie = extractCookiesFromFile(cookieArgs);

    const { getInfo } = await import('../extractors/index.js');
    const jsInfo = (await getInfo(targetUrl, {
      cookie: rawCookie,
      onProgress,
    })) as VideoInfo;

    const hasHD = jsInfo?.formats?.some(
      (f: Format) =>
        (f.resolution &&
          (f.resolution.includes('720') ||
            f.resolution.includes('1080') ||
            f.resolution.includes('HD') ||
            f.resolution.includes('Source'))) ||
        (f.height && f.height >= 720)
    );

    const isFbStory =
      targetUrl.includes('/stories/') ||
      jsInfo?.webpageUrl?.includes('/stories/');
    const hasPhoto = jsInfo?.formats?.some(
      (f: Format) => f.formatId === 'photo'
    );

    if (isSocial && jsInfo && !hasHD && !isFbStory && !hasPhoto) {
      console.log(
        `[Metadata] Engine: Pure-JS | Platform: ${platform} | URL: ${targetUrl} (SD only, falling back to yt-dlp for HD)`
      );
      return null;
    } else if (jsInfo?.formats && jsInfo.formats.length > 0) {
      await setCachedInfo(cacheKey, jsInfo);
      return jsInfo;
    }
  } catch (e: unknown) {
    const err = e as Error;
    console.warn(
      `[Metadata] Engine: Pure-JS | Platform: ${platform} | URL: ${targetUrl} (Failed: ${err.message})`
    );
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

  let targetUrl = normalizeUrl(url);
  console.log('[Info] Normalized URL:', targetUrl);

  if (targetUrl.includes('http') && targetUrl.lastIndexOf('http') > 0) {
    targetUrl = targetUrl.substring(targetUrl.lastIndexOf('http'));
    console.log(`[Info] Fixed double-pasted URL: ${targetUrl}`);
  }

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
    targetUrl = await expandShortUrl(url);
    console.log('[Info] Expanded URL:', targetUrl);
  }

  const cacheKey = `${targetUrl}_${cookieArgs.join('_')}`;

  // sync prefetch
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

  // check cache
  const cached = await getCachedInfo(cacheKey, forceRefresh, clientId);
  if (cached) return cached;

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
      onProgress
    );
    if (jsInfo) return jsInfo;
  }

  // handle social
  if (!isYouTube) {
    const socialInfo = await handleSocialJSInfo(
      targetUrl,
      cacheKey,
      cookieArgs,
      onProgress
    );
    if (socialInfo) return socialInfo;
  }

  // fallback ytdlp
  const isFbStory = targetUrl.includes('/stories/');
  if (isFbStory) throw new Error('Could not extract Facebook Story media.');

  const info = await runYtdlpInfo(targetUrl, cookieArgs, signal);
  await setCachedInfo(cacheKey, info);
  return info;
}

export async function cacheVideoInfo(
  url: string,
  data: VideoInfo,
  cookieArgs: string[] = []
): Promise<void> {
  const targetUrl = normalizeUrl(url);
  await setCachedInfo(`${targetUrl}_${cookieArgs.join('_')}`, data);
}
