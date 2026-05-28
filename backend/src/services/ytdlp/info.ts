import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { COMMON_ARGS, CACHE_DIR, USER_AGENT, REFERER_MAP } from './config.js';
import { isSupportedUrl } from '../../utils/network/validation.util.js';
import { normalizeUrl } from '../../utils/media/video.util.js';
import { sendEvent } from '../../utils/network/sse.util.js';
import {
  VideoInfo,
  SpotifyMetadata,
  SSEEvent,
  Format,
} from '../../types/index.js';
import { getTraceId } from '../../utils/infra/trace.util.js';
import { secureFetch } from '../../utils/network/security.util.js';
import {
  processVideoFormats,
  processAudioFormats,
} from '../../utils/media/format.util.js';

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
    status:
      status === 'fetching_info'
        ? 'initializing'
        : (status as SSEEvent['status']),
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
        event.subStatus = 'Metadata found!';
        event.details = undefined;
      }
    } catch (error) {
      console.debug(
        '[SSE] Failed to parse early metadata JSON:',
        (error as Error).message
      );
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
  // check l1
  const cachedL1 = metadataCache.get(cacheKey);
  if (
    cachedL1 &&
    !forceRefresh &&
    Date.now() - cachedL1.timestamp < 300_000
  ) {
    return cachedL1.data;
  }

  if (!forceRefresh) {
    try {
      const redisGet = redis.get(`meta:${cacheKey}`);
      const cachedRedis = await Promise.race([
        redisGet,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
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
    } catch (error) {
      console.warn(
        '[Info] Redis cache fetch failed:',
        (error as Error).message
      );
    }
  }
  return null;
}

async function setCachedInfo(cacheKey: string, data: VideoInfo) {
  // safety net: never cache raw yt-dlp shape
  ensureNormalizedFormats(data);
  metadataCache.set(cacheKey, { data, timestamp: Date.now() });
  try {
    await redis.set(
      `meta:${cacheKey}`,
      JSON.stringify(data),
      'PX',
      METADATA_EXPIRY
    );
  } catch (error) {
    console.warn('[Info] Redis cache save failed:', (error as Error).message);
  }
}

// avoid redundant extraction in streamer
async function persistInfoJsonToDisk(
  info: VideoInfo,
  rawJson: string
): Promise<void> {
  if (!info.id || !rawJson) return;
  try {
    const dir = path.join(CACHE_DIR, 'metadata');
    await fs.promises.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${info.id}.json`);
    await fs.promises.writeFile(filePath, rawJson, 'utf8');
  } catch (error) {
    // non-critical optimization fallback
    console.debug(
      '[Info] Disk JSON cache write failed:',
      (error as Error).message
    );
  }
}

// ensure consistent data shape for streamer
function ensureNormalizedFormats(info: VideoInfo): void {
  if (!info || !Array.isArray(info.formats)) return;
  const first = info.formats[0] as unknown as
    | { format_id?: unknown; formatId?: unknown }
    | undefined;
  const looksRaw =
    Boolean(first) &&
    first?.formatId === undefined &&
    first?.format_id !== undefined;
  if (!looksRaw) return;

  const rawList = info.formats as Parameters<
    typeof processVideoFormats
  >[0]['formats'];
  info.formats = processVideoFormats({
    duration: info.duration,
    formats: rawList,
  });
  info.audioFormats = processAudioFormats({ formats: rawList });
}

export async function expandShortUrl(url: string): Promise<string> {
  // instant youtube expansion
  if (url.includes('youtu.be/')) {
    const id = url.split('youtu.be/')[1]?.split(/[?#]/u)[0];
    if (id) return `https://www.youtube.com/watch?v=${id}`;
  }

  try {
    const response = await secureFetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });
    return response.url || url;
  } catch (error) {
    console.debug('[Info] HEAD expansion failed:', (error as Error).message);
    try {
      const getResponse = await secureFetch(url, {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'follow',
      });
      return getResponse.url || url;
    } catch (getError) {
      console.debug(
        '[Info] GET expansion failed:',
        (getError as Error).message
      );
      return url;
    }
  }
}

export function runYtdlpInfo(
  targetUrl: string,
  cookieArgs: string[],
  signal: AbortSignal | null = null,
  isRetry = false
): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    const refererResult = Object.entries(REFERER_MAP).find(([domain]) =>
      targetUrl.includes(domain)
    );
    const referer = refererResult ? refererResult[1] : '';
    const effectiveCookieArgs = COMMON_ARGS.includes('--cookies')
      ? []
      : cookieArgs;
    let args = [
      ...effectiveCookieArgs,
      '--dump-json',
      '--user-agent',
      USER_AGENT,
      ...COMMON_ARGS,
      '--extractor-args',
      'youtube:player-client=android_vr',
      '--cache-dir',
      CACHE_DIR,
    ];
    if (referer) args.push('--referer', referer);

    if (isRetry) {
      const cleanArgs: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cookies') {
          i++; // skip the path
        } else if (args[i] === '--geo-bypass') {
          // skip
        } else {
          cleanArgs.push(args[i]);
        }
      }
      cleanArgs.push('--no-cookies', '--no-geo-bypass');
      args = cleanArgs;
    }

    args.push(targetUrl);

    // full path
    const ytdlpPath = 'yt-dlp';
    const childProcess = spawn(ytdlpPath, args, { detached: true });

    if (signal) {
      const abortHandler = () => {
        if (childProcess.pid && childProcess.exitCode === null) {
          try {
            process.kill(-childProcess.pid, 'SIGKILL');
          } catch (error) {
            console.debug(
              '[Process] Abort signal kill failed:',
              (error as Error).message
            );
          }
        }
        reject(new Error('Process Aborted'));
      };
      signal.addEventListener('abort', abortHandler, { once: true });
      childProcess.on('close', () =>
        signal.removeEventListener('abort', abortHandler)
      );
    }

    let stdout = '',
      stderr = '';
    childProcess.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    childProcess.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    childProcess.on('close', (code) => {
      let parsedData: VideoInfo | null = null;
      if (stdout.trim()) {
        try {
          parsedData = JSON.parse(stdout) as VideoInfo;
        } catch (error: unknown) {
          const err = error as Error;
          console.debug('[YtdlpInfo] JSON parse error:', err.message);
        }
      }
      if (code !== 0 && code !== null) {
        const errorMsg = stderr.trim();
        console.error(
          `[yt-dlp-error] Code ${code}: ${errorMsg} | Command: ${ytdlpPath} ${args.join(' ')}`
        );

        // retry without cookies
        if (
          !isRetry &&
          (errorMsg.includes('Requested format is not available') ||
            errorMsg.includes('Sign in to confirm you’re not a bot'))
        ) {
          console.log('[YtdlpInfo] Retrying WITHOUT cookies/geo-bypass...');
          resolve(runYtdlpInfo(targetUrl, cookieArgs, signal, true));
          return;
        }

        if (!parsedData || !parsedData.title) {
          reject(new Error(errorMsg || 'yt-dlp failed'));
          return;
        }
      }
      if (!parsedData) {
        reject(new Error('yt-dlp returned no valid JSON'));
        return;
      }

      // handle ig wall
      if (parsedData.title?.includes('Welcome back to Instagram')) {
        reject(new Error('Instagram Login Wall detected in yt-dlp'));
        return;
      }

      // cache for subsequent stream spawn
      void persistInfoJsonToDisk(parsedData, stdout);

      resolve(parsedData);
    });
  });
}

function _parseBrainData(
  cachedBrain: VideoInfo & { youtubeUrl?: string },
  targetUrl: string
) {
  return {
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
}

async function _refreshSpotifyPreview(
  targetUrl: string,
  brainData: VideoInfo & { imageUrl?: string },
  onProgress: ProgressCallback,
  spotifyIdx: {
    refreshPreviewIfNeeded?: (
      url: string,
      data: VideoInfo | SpotifyMetadata,
      onProgress: ProgressCallback
    ) => Promise<void>;
  }
) {
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
      .catch((error: Error) => {
        console.debug('[Spotify] Preview refresh failed:', error.message);
      });
  }
}

function _mapSpotifyToVideoInfo(
  brainData: VideoInfo & { imageUrl?: string },
  targetUrl: string
): VideoInfo {
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
      const brainData = _parseBrainData(cachedBrain, targetUrl);
      if (brainData.formats.length > 0 && brainData.targetUrl) {
        if (clientId)
          sendEvent(clientId, { text: 'registry hit', status: 'success' });

        await _refreshSpotifyPreview(
          targetUrl,
          brainData,
          onProgress,
          spotifyIdx
        );
        return _mapSpotifyToVideoInfo(brainData, targetUrl);
      }
    } catch (error: unknown) {
      const err = error as Error;
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
      .catch((error: Error) => {
        console.debug(
          '[Spotify] Initial preview refresh failed:',
          error.message
        );
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

        await new Promise((resolve) => setTimeout(resolve, 500));
        await setCachedInfo(cacheKey, finalData);
        if (clientId) sendEvent(clientId, ssePayload);

        const { saveToBrain: saveMapping } =
          await import('../spotify.service.js');
        saveMapping(targetUrl, finalData as unknown as SpotifyMetadata);

        return finalData;
      }
      return null;
    } catch (error: unknown) {
      const err = error as Error;
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

// enrich with yt-dlp
async function runYtdlpEnhancement(
  cacheKey: string,
  targetUrl: string,
  cookieArgs: string[],
  baseInfo: VideoInfo | null,
  clientId: string | null,
  precomputed?: Promise<VideoInfo | null> | VideoInfo | null
): Promise<void> {
  try {
    let fullInfo: VideoInfo | null = null;
    if (precomputed !== undefined) {
      fullInfo = await Promise.resolve(precomputed);
    } else {
      fullInfo = await runYtdlpInfo(targetUrl, cookieArgs);
    }

    if (!fullInfo) return;

    fullInfo.isJsInfo = true;
    fullInfo.isPartial = false;
    fullInfo.isFullData = true;
    fullInfo.extractorKey = targetUrl.includes('tiktok.com')
      ? 'tiktok'
      : 'youtube';

    ensureNormalizedFormats(fullInfo);

    const baseFormatCount = baseInfo?.formats?.length || 0;
    const fullFormatCount = fullInfo.formats?.length || 0;

    if (fullFormatCount <= baseFormatCount) {
      return;
    }

    await setCachedInfo(cacheKey, fullInfo);

    if (clientId) {
      const { prepareFinalResponse } =
        await import('../../utils/api/response.util.js');
      const finalData = (await prepareFinalResponse(
        fullInfo,
        false,
        null,
        targetUrl
      )) as VideoInfo;
      console.log(
        `[Info] [Enhancement] yt-dlp added ${fullFormatCount - baseFormatCount} formats for ${finalData.title}, pushing update.`
      );
      console.log(
        `[Info] [Enhancement] Processed formats: ${finalData.formats?.length || 0} video, ${finalData.audioFormats?.length || 0} audio. Heights: ${(finalData.formats || []).map((fmt) => fmt.height || '?').join(',')}`
      );
      sendEvent(clientId, {
        status: 'success',
        text: 'Quality resolution enhanced.',
        metadata_update: {
          ...finalData,
          isFullData: true,
          isPartial: false,
        },
      });
    }
  } catch (error: unknown) {
    console.debug(
      '[Info] [Enhancement] yt-dlp failed:',
      (error as Error).message
    );
  }
}

// handle yt/tiktok
async function handleYoutubeTiktokInfo(
  targetUrl: string,
  cacheKey: string,
  cookieArgs: string[],
  clientId: string | null,
  onProgress: ProgressCallback,
  requestT0?: number
): Promise<VideoInfo | null> {
  try {
    const extractorsModule = await import('../extractors/index.js');
    const { getInfo, getInFlightJsResult } = extractorsModule;
    const jsInfo = (await getInfo(targetUrl, {
      onProgress,
      requestT0,
    })) as VideoInfo;

    const hasFormats = jsInfo?.formats?.length > 0;
    const hasMetadata = jsInfo?.title && jsInfo.title !== 'Unknown Video';

    if (!hasFormats && !hasMetadata) return null;

    const extractorKey = targetUrl.includes('tiktok.com')
      ? 'tiktok'
      : 'youtube';

    // check JS health
    const jsLooksHealthy =
      hasFormats &&
      (jsInfo?.formats || []).length >= 3 &&
      (jsInfo?.formats || []).some(
        (formatItem) => (formatItem.height ?? 0) >= 720
      );

    // cache healthy JS
    if (jsLooksHealthy) {
      const fullInfo: VideoInfo = {
        ...jsInfo,
        isJsInfo: true,
        isPartial: false,
        isFullData: true,
        extractorKey,
      };
      await setCachedInfo(cacheKey, fullInfo);

      void runYtdlpEnhancement(
        cacheKey,
        targetUrl,
        cookieArgs,
        jsInfo,
        clientId
      );

      const { prepareFinalResponse } =
        await import('../../utils/api/response.util.js');
      return (await prepareFinalResponse(
        jsInfo,
        false,
        null,
        targetUrl
      )) as VideoInfo;
    }

    if (hasFormats) {
      console.log(
        `[Info] JS race winner has only ${(jsInfo?.formats || []).length} formats (no 720p+); escalating to fallbackTask.`
      );
    }

    /**
     * Meta-only result (oEmbed/metascraper won the race). Spawn a background
     * resolution task: prefer the still-running JS extractor, only fall back
     * to yt-dlp if JS produced no formats. After JS settles, run yt-dlp as a
     * detached enhancement pass so 4K/8K formats still get added without
     * blocking the prefetch promise.
     */
    const fallbackTask = (async () => {
      try {
        const prefetchUrl = jsInfo?.targetUrl || targetUrl;

        /**
         * Speculative parallel start: kick off yt-dlp the instant we know
         * we're on the meta-only path. If Innertube succeeds we'll still use
         * its result, but the yt-dlp Promise is already in flight and feeds
         * the enhancement step with zero extra wait. If Innertube fails
         * (common on Termux due to flaky decipher), we await this same
         * Promise instead of serially spawning yt-dlp afterwards — saving
         * 1-2s per failed JS run.
         */
        const ytdlpSpeculative: Promise<VideoInfo | null> = runYtdlpInfo(
          prefetchUrl,
          cookieArgs
        ).catch((error: unknown) => {
          console.debug(
            '[Info] [Background] Speculative yt-dlp failed:',
            (error as Error).message
          );
          return null;
        });

        // await js result
        const jsPromise = getInFlightJsResult(targetUrl);
        if (jsPromise) {
          const jsResult = await jsPromise;
          const jsFormats = jsResult?.formats || [];
          /**
           * Treat as "JS empty" if the JS path produced only a tiny subset
           * (e.g. Termux decipher failures often leave only the muxed 360p
           * legacy stream). Threshold: at least 3 formats AND at least one
           * 720p+ entry. Otherwise yt-dlp will give us the real picture.
           */
          const jsHasHd = jsFormats.some(
            (formatItem) => (formatItem.height ?? 0) >= 720
          );
          const jsLooksHealthy =
            jsResult !== null && jsFormats.length >= 3 && jsHasHd;

          if (jsLooksHealthy && jsResult) {
            const fullInfo: VideoInfo = {
              ...jsResult,
              isJsInfo: true,
              isPartial: false,
              isFullData: true,
              extractorKey,
            };

            await setCachedInfo(cacheKey, fullInfo);

            if (clientId) {
              const { prepareFinalResponse } =
                await import('../../utils/api/response.util.js');
              const finalData = (await prepareFinalResponse(
                fullInfo,
                false,
                null,
                targetUrl
              )) as VideoInfo;
              console.log(
                `[Info] [Background] JS resolution complete for ${finalData.title} (${jsFormats.length} JS formats), pushing update.`
              );
              sendEvent(clientId, {
                status: 'success',
                text: 'Quality resolution complete.',
                metadata_update: {
                  ...finalData,
                  isFullData: true,
                  isPartial: false,
                },
              });
            }

            /**
             * Detached: hand the speculative yt-dlp result to the
             * enhancement pipeline. No second yt-dlp invocation; reuses the
             * running one.
             */
            void runYtdlpEnhancement(
              cacheKey,
              targetUrl,
              cookieArgs,
              jsResult,
              clientId,
              ytdlpSpeculative
            );
            return fullInfo;
          }

          if (jsFormats.length > 0) {
            console.log(
              `[Info] [Background] JS produced only ${jsFormats.length} formats (HD=${jsHasHd}); escalating to yt-dlp speculative.`
            );
          }
        }

        // await speculative yt-dlp
        console.log(
          '[Info] [Background] JS empty, awaiting speculative yt-dlp...'
        );
        const fullInfo = await ytdlpSpeculative;
        if (!fullInfo) {
          console.warn(
            '[Info] [Background] Speculative yt-dlp returned no info'
          );
          return null;
        }

        fullInfo.isJsInfo = true;
        fullInfo.isPartial = false;
        fullInfo.isFullData = true;
        fullInfo.extractorKey = extractorKey;

        ensureNormalizedFormats(fullInfo);

        await setCachedInfo(cacheKey, fullInfo);

        if (clientId) {
          const { prepareFinalResponse } =
            await import('../../utils/api/response.util.js');
          const finalData = (await prepareFinalResponse(
            fullInfo,
            false,
            null,
            targetUrl
          )) as VideoInfo;

          console.log(
            `[Info] [Background] Deep-scan complete for ${finalData.title}, pushing update.`
          );
          sendEvent(clientId, {
            status: 'success',
            text: 'Quality resolution complete.',
            metadata_update: {
              ...finalData,
              isFullData: true,
              isPartial: false,
            },
          });
        }
        return fullInfo;
      } catch (error: unknown) {
        console.warn(
          '[Info] [Background] Resolution failed:',
          (error as Error).message
        );
        return null;
      } finally {
        prefetchPromises.delete(cacheKey);
      }
    })();

    prefetchPromises.set(
      cacheKey,
      fallbackTask as Promise<VideoInfo | undefined>
    );

    // fast partial return
    console.log(
      '[Info] Fast metadata hit, returning partial info immediately.'
    );
    return {
      ...jsInfo,
      isPartial: true,
      formats: [],
      audioFormats: [],
    } as VideoInfo;
  } catch (error: unknown) {
    const err = error as Error;
    if (err.name === 'ZodError') {
      const issues = (err as { issues?: unknown }).issues;
      console.error('[Metadata] Zod Validation Failed for Pure-JS:', issues);
    }
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

const _handleHasHD = (
  jsInfo: VideoInfo,
  targetUrl: string,
  platform: string
) => {
  const formats = jsInfo.formats || [];
  const hasHD = formats.some(
    (formatItem: Format) =>
      (formatItem.resolution &&
        (formatItem.resolution.includes('720') ||
          formatItem.resolution.includes('1080') ||
          formatItem.resolution.includes('HD') ||
          formatItem.resolution.includes('Source'))) ||
      (formatItem.height && formatItem.height >= 720)
  );

  const isFbStory =
    targetUrl.includes('/stories/') || jsInfo.webpageUrl?.includes('/stories/');
  const hasPhoto = formats.some(
    (formatItem: Format) => formatItem.formatId === 'photo'
  );

  if (!hasHD && !isFbStory && !hasPhoto) {
    console.log(
      `[Metadata] Engine: Pure-JS | Platform: ${platform} | URL: ${targetUrl} (SD only, falling back to yt-dlp for HD)`
    );
    return null;
  }
  return jsInfo;
};

// handle social
async function handleSocialJSInfo(
  targetUrl: string,
  cacheKey: string,
  cookieArgs: string[],
  onProgress: ProgressCallback
): Promise<VideoInfo | null> {
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

    if (jsInfo?.formats?.length > 0) {
      const finalInfo = _handleHasHD(jsInfo, targetUrl, platform);
      if (finalInfo) {
        await setCachedInfo(cacheKey, finalInfo);
        return finalInfo;
      }
    }
  } catch (error: unknown) {
    const err = error as Error;
    console.warn(
      `[Metadata] Engine: Pure-JS | Platform: ${platform} | URL: ${targetUrl} (Failed: ${err.message})`
    );
  }
  return null;
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
