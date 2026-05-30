import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { COMMON_ARGS, CACHE_DIR, USER_AGENT, REFERER_MAP } from './config.js';
import { sendEvent } from '../../utils/network/sse.util.js';
import { VideoInfo, SSEEvent } from '../../types/index.js';
import { secureFetch } from '../../utils/network/security.util.js';
import {
  processVideoFormats,
  processAudioFormats,
} from '../../utils/media/format.util.js';
import { createRedisClient } from '../../utils/infra/redis.util.js';

export type ProgressCallback = (
  status: string,
  progress: number,
  subStatus?: string,
  details?: string
) => void;

const redis = createRedisClient('MetadataCache');
const metadataCache = new Map<string, { data: VideoInfo; timestamp: number }>();
export const prefetchPromises = new Map<
  string,
  Promise<VideoInfo | undefined>
>();
const METADATA_EXPIRY = 7200000; // 2 hours

// report progress
export function reportProgress(
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
export async function getCachedInfo(
  cacheKey: string,
  forceRefresh: boolean,
  clientId: string | null
): Promise<VideoInfo | null> {
  // check l1
  const cachedL1 = metadataCache.get(cacheKey);
  if (cachedL1 && !forceRefresh && Date.now() - cachedL1.timestamp < 300_000) {
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

export async function setCachedInfo(cacheKey: string, data: VideoInfo) {
  // skip caching partial or empty results
  if (data?.isPartial === true || !data?.formats?.length) {
    return;
  }
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
export function ensureNormalizedFormats(info: VideoInfo): void {
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
      'youtube:player-client=tv,android_vr,mweb,web_embedded',
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
