import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { COMMON_ARGS, CACHE_DIR, USER_AGENT, REFERER_MAP } from "./config.js";
import { isSupportedUrl } from "../../utils/validation.util.js";
import { normalizeUrl } from "../../utils/video.util.js";
import { sendEvent } from "../../utils/sse.util.js";
import { VideoInfo, SpotifyMetadata, SSEEvent } from "../../types/index.js";

const metadataCache = new Map<string, { data: VideoInfo; timestamp: number }>();
const prefetchPromises = new Map<string, Promise<VideoInfo>>();
const METADATA_EXPIRY = 7200000;

// report progress
function reportProgress(clientId: string | null, status: string, progress: number, subStatus?: string, details?: string) {
  if (!clientId) return;
  sendEvent(clientId, {
    status: (status === 'fetching_info' ? 'initializing' : status) as SSEEvent['status'],
    progress,
    subStatus: subStatus || 'Analysing...',
    details
  });
}

// check cache
function getCachedInfo(cacheKey: string, forceRefresh: boolean, clientId: string | null): VideoInfo | null {
  const cached = metadataCache.get(cacheKey);
  if (cached && !forceRefresh && (Date.now() - cached.timestamp < METADATA_EXPIRY)) {
    reportProgress(clientId, "initializing", 28, "Cache Hit!", "REGISTRY: RETRIEVING_PERSISTENT_METADATA");
    return cached.data;
  }
  return null;
}

export async function expandShortUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { "User-Agent": USER_AGENT },
      redirect: 'follow'
    });
    return res.url || url;
  } catch (_err) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { "User-Agent": USER_AGENT },
        redirect: 'follow'
      });
      return res.url || url;
    } catch (_err2) {
      return url;
    }
  }
}

function runYtdlpInfo(targetUrl: string, cookieArgs: string[], signal: AbortSignal | null = null): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    const referer =
      Object.entries(REFERER_MAP).find(([domain]) =>
        targetUrl.includes(domain),
      )?.[1] || "";
    const args = [
      ...cookieArgs,
      "--dump-json",
      "--user-agent", USER_AGENT,
      ...COMMON_ARGS,
      "--cache-dir", CACHE_DIR,
    ];
    if (referer) args.push("--referer", referer);
    args.push(targetUrl);

    const proc = spawn("yt-dlp", args);

    if (signal) {
      signal.addEventListener("abort", () => {
        if (proc.exitCode === null) proc.kill("SIGKILL");
        reject(new Error("Process Aborted"));
      });
    }

    let stdout = "", stderr = "";
    proc.stdout.on("data", (d) => { stdout += d; });
    proc.stderr.on("data", (d) => { stderr += d; });
    proc.on("close", (code) => {
      let parsedData: VideoInfo | null = null;
      if (stdout.trim()) {
        try { parsedData = JSON.parse(stdout) as VideoInfo; } catch (e: unknown) { 
          const err = e as Error;
          console.debug('[YtdlpInfo] JSON parse error:', err.message); 
        }
      }
      if (code !== 0 && code !== null) {
        console.error(`[yt-dlp-error] Code ${code}: ${stderr.trim()}`);
        if (!parsedData || !parsedData.title) return reject(new Error(stderr || "yt-dlp failed"));
      }
      if (!parsedData) return reject(new Error("yt-dlp returned no valid JSON"));
      
      // handle IG login wall in yt-dlp output
      if (parsedData.title && parsedData.title.includes('Welcome back to Instagram')) {
          return reject(new Error("Instagram Login Wall detected in yt-dlp"));
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
  onProgress: (status: string, progress: number, subStatus?: string, details?: string) => void
): Promise<VideoInfo> {
  const { fetchInitialMetadata } = await import('../spotify/metadata.js');
  const spotifyIdx = await import('../spotify/index.js') as { refreshPreviewIfNeeded?: (url: string, data: unknown, onProgress: (status: string, progress: number, subStatus?: string, details?: string) => void) => Promise<void> };
  const { getFromBrain } = await import('../spotify/brain.js');

  const cachedBrain = await getFromBrain(targetUrl) as (VideoInfo & { youtubeUrl?: string }) | null;
  if (cachedBrain && cachedBrain.formats) {
    try {
      const brainData = {
        ...cachedBrain,
        imageUrl: (cachedBrain as any).imageUrl || "/logo.webp",
        formats: typeof cachedBrain.formats === 'string' ? JSON.parse(cachedBrain.formats) : cachedBrain.formats,
        audioFormats: typeof cachedBrain.audioFormats === 'string' ? JSON.parse(cachedBrain.audioFormats) : cachedBrain.audioFormats,
        audioFeatures: typeof (cachedBrain as any).audioFeatures === 'string' ? JSON.parse((cachedBrain as any).audioFeatures) : (cachedBrain as any).audioFeatures,
        targetUrl: cachedBrain.youtubeUrl,
        target_url: cachedBrain.youtubeUrl,
        fromBrain: true,
      };

      if (brainData.formats.length > 0 && brainData.target_url) {
        if (clientId) sendEvent(clientId, { text: "registry hit", status: "success" });

        const preview = brainData.previewUrl;
        const isExpiringCDN = !preview ||
          preview.includes('scdn.co') ||
          preview.includes('spotify') ||
          preview.includes('dzcdn.net') ||
          preview.includes('mzstatic.com') ||
          preview.includes('itunes.apple.com');

        if (isExpiringCDN && spotifyIdx.refreshPreviewIfNeeded) {
          await spotifyIdx.refreshPreviewIfNeeded(targetUrl, brainData, onProgress).catch(() => { });
        }

        return {
          ...brainData,
          previewUrl: brainData.previewUrl,
          cover: brainData.imageUrl,
          thumbnail: brainData.imageUrl,
          duration: brainData.duration ? brainData.duration / 1000 : 0,
          is_spotify: true,
          extractor_key: 'spotify',
          isPartial: false
        } as VideoInfo;
      }
    } catch (e: unknown) {
      const err = e as Error;
      console.warn(`[Info] [Speed] Failed to parse brain data:`, err.message);
    }
  }

  const { metadata } = await fetchInitialMetadata(targetUrl, onProgress, Date.now()) as { metadata: SpotifyMetadata };

  if (spotifyIdx.refreshPreviewIfNeeded) {
    await spotifyIdx.refreshPreviewIfNeeded(targetUrl, metadata, onProgress).catch(() => { });
  }

const resolutionPromise = (async () => {
  try {
    const { runPriorityRace } = await import('../spotify/resolver.js');
    const bestMatch = await runPriorityRace(targetUrl, metadata, [], onProgress) as { url: string; type?: string };

    if (bestMatch?.url) {
      const matchType = bestMatch.type || 'UNKNOWN';
      const { getInfo } = await import('../extractors/index.js');
      const ytInfo = await getInfo(bestMatch.url);
      if (!ytInfo) throw new Error("Failed to fetch match information.");

      const { prepareFinalResponse } = await import('../../utils/response.util.js');
      const finalData = await prepareFinalResponse(ytInfo, true, metadata, targetUrl) as VideoInfo;
      finalData.target_url = bestMatch.url;
      finalData.is_spotify = true;
      finalData.is_js_info = true;
      finalData.imageUrl = metadata.imageUrl;
      finalData.isIsrcMatch = !!(matchType === 'ISRC' || matchType === 'Soundcharts');
      finalData.isrc = metadata.isrc;
      finalData.webpage_url = targetUrl;

      const ssePayload: SSEEvent = {
        status: "success",
        text: "Resolution complete.",
        metadata_update: {
          ...finalData,
          isFullData: true,
          isPartial: false
        }
      };

      await new Promise(r => setTimeout(r, 500));
      metadataCache.set(cacheKey, { data: finalData, timestamp: Date.now() });
      if (clientId) sendEvent(clientId, ssePayload);

      const { saveToBrain } = await import('../spotify.service.js');
      saveToBrain(targetUrl, finalData as unknown as SpotifyMetadata).catch((err: Error) => {
        console.warn(`[Info] [Speed] Failed to save to brain:`, err.message);
      });

      return finalData;
    }
  } catch (e: unknown) {
    const err = e as Error;
    console.warn(`[Info] [Speed] Background resolution failed:`, err.message);
  } finally {
    prefetchPromises.delete(cacheKey);
  }
})();

prefetchPromises.set(cacheKey, resolutionPromise as Promise<VideoInfo>);

return {
  ...metadata,
  id: targetUrl,
  title: metadata.title || 'Unknown',
  uploader: metadata.artist || 'Unknown',
  webpage_url: targetUrl,
  cover: metadata.imageUrl,
  thumbnail: metadata.imageUrl,
  is_spotify: true,
  extractor_key: 'spotify',
  formats: [],
  isPartial: true
} as VideoInfo;

          fullInfo.is_js_info = true;
          fullInfo.extractor_key = targetUrl.includes('tiktok.com') ? 'tiktok' : 'youtube';

          const infoJsonDir = path.join(CACHE_DIR, 'metadata');
          if (!fs.existsSync(infoJsonDir)) fs.mkdirSync(infoJsonDir, { recursive: true });
          const infoJsonPath = path.join(infoJsonDir, `${fullInfo.id}.json`);
          fs.writeFileSync(infoJsonPath, JSON.stringify(fullInfo));
          fullInfo.original_info = infoJsonPath;

          metadataCache.set(cacheKey, { data: fullInfo, timestamp: Date.now() });

          // async push
          if (clientId) {
            (async () => {
              const { prepareFinalResponse } = await import('../../utils/response.util.js');
              const finalData = await prepareFinalResponse(fullInfo, false, null, targetUrl) as VideoInfo;
              sendEvent(clientId, {
                status: "success",
                text: "Resolution complete.",
                metadata_update: {
                  ...finalData,
                  isFullData: true,
                  isPartial: false
                }
              });
            })().catch(e => console.error('[SSE] Failed to push update:', e));
          }
          return fullInfo;
        } catch (e: unknown) {
          const err = e as Error;
          console.warn(`[Prefetch] Background warm-up failed:`, err.message);
        } finally {
          prefetchPromises.delete(cacheKey);
        }
      })();

      prefetchPromises.set(cacheKey, prefetch as Promise<VideoInfo>);

      const { prepareFinalResponse } = await import('../../utils/response.util.js');

      const needsSize = !jsInfo.formats[0]?.filesize || jsInfo.formats[0].filesize === 0;
      if (needsSize) {
        await Promise.race([prefetch, new Promise(r => setTimeout(r, 300))]);
        const updated = metadataCache.get(cacheKey);
        if (updated && updated.data.formats?.[0]?.filesize) {
          return await prepareFinalResponse(updated.data, false, null, targetUrl) as VideoInfo;
        }
      }

      return await prepareFinalResponse(jsInfo, false, null, targetUrl) as VideoInfo;
    }
  } catch (e: unknown) {
    const err = e as Error;
    console.warn(`[Metadata] Engine: Pure-JS URL: ${targetUrl} (Failed: ${err.message})`);
  }
  return null;
}

// handle social
async function handleSocialJSInfo(
  targetUrl: string,
  cacheKey: string,
  cookieArgs: string[],
  onProgress: (status: string, progress: number, subStatus?: string, details?: string) => void
): Promise<VideoInfo | null> {
  const isSocial = targetUrl.includes("facebook.com") || targetUrl.includes("instagram.com") || targetUrl.includes("tiktok.com");
  const platform = targetUrl.includes('facebook.com') ? 'Facebook' :
    targetUrl.includes('instagram.com') ? 'Instagram' :
      targetUrl.includes('tiktok.com') ? 'TikTok' : 'Social';

  try {
    let rawCookie: string | null = null;
    if (cookieArgs && cookieArgs.includes('--cookies')) {
      const cookiePath = cookieArgs[cookieArgs.indexOf('--cookies') + 1];
      if (cookiePath && fs.existsSync(cookiePath)) {
        const content = fs.readFileSync(cookiePath, 'utf8');
        const lines = content.split('\n');
        const pairs: string[] = [];
        for (const line of lines) {
          if (!line.trim() || line.startsWith('#')) continue;
          const parts = line.split('\t');
          if (parts.length >= 7) pairs.push(`${parts[5].trim()}=${parts[6].trim()}`);
        }
        rawCookie = pairs.join('; ');
      }
    }

    const { getInfo } = await import('../extractors/index.js');
    const jsInfo = await getInfo(targetUrl, {
      cookie: rawCookie || cookieArgs.join('; '),
      onProgress
    }) as VideoInfo;

    const hasHD = jsInfo && jsInfo.formats && jsInfo.formats.some((f) =>
      (f.resolution && (f.resolution.includes('720') || f.resolution.includes('1080') || f.resolution.includes('HD') || f.resolution.includes('Source'))) ||
      (f.height && f.height >= 720)
    );

    const isFbStory = targetUrl.includes('/stories/') || (jsInfo?.webpage_url && jsInfo.webpage_url.includes('/stories/'));
    const hasPhoto = jsInfo && jsInfo.formats && jsInfo.formats.some((f) => f.format_id === 'photo');

    if (isSocial && jsInfo && !hasHD && !isFbStory && !hasPhoto) {
      console.log(`[Metadata] Engine: Pure-JS | Platform: ${platform} | URL: ${targetUrl} (SD only, falling back to yt-dlp for HD)`);
      return null;
    } else if (jsInfo != null && typeof jsInfo === 'object' && Array.isArray(jsInfo.formats) && jsInfo.formats.length > 0) {
      metadataCache.set(cacheKey, { data: jsInfo, timestamp: Date.now() });
      return jsInfo;
    }
  } catch (e: unknown) {
    const err = e as Error;
    console.warn(`[Metadata] Engine: Pure-JS | Platform: ${platform} | URL: ${targetUrl} (Failed: ${err.message})`);
  }
  return null;
}

export async function getVideoInfo(
  url: string,
  cookieArgs: string[] = [],
  forceRefresh: boolean = false,
  signal: AbortSignal | null = null,
  clientId: string | null = null
): Promise<VideoInfo> {
  console.log('[Info] Starting getVideoInfo for:', url);
  if (!isSupportedUrl(url)) throw new Error("Unsupported or malicious URL");

  const onProgress = (status: string, progress: number, subStatus?: string, details?: string) => {
    console.log('[Info] Progress:', status, subStatus);
    reportProgress(clientId, status, progress, subStatus, details);
  };

  let targetUrl = normalizeUrl(url);
  console.log('[Info] Normalized URL:', targetUrl);

  if (targetUrl.includes('http') && targetUrl.lastIndexOf('http') > 0) {
    targetUrl = targetUrl.substring(targetUrl.lastIndexOf('http'));
    console.log(`[Info] Fixed double-pasted URL: ${targetUrl}`);
  }

  const needsExpansion = url.includes("bili.im") || url.includes("fb.watch") || url.includes("fb.gg") ||
    url.includes("youtu.be") || url.includes("share/") || url.includes("vt.tiktok.com") || url.includes("on.soundcloud.com");

  if (needsExpansion) {
    console.log('[Info] Expanding URL:', url);
    reportProgress(clientId, "initializing", 12, "Expanding short-links...", "NETWORK: RESOLVING_REDIRECTS");
    targetUrl = await expandShortUrl(url);
    console.log('[Info] Expanded URL:', targetUrl);
  }

  const cacheKey = `${targetUrl}_${cookieArgs.join("_")}`;

  // sync prefetch
  if (prefetchPromises.has(cacheKey)) {
    reportProgress(clientId, "initializing", 15, "Syncing with uplink...", "CACHE: AWAITING_PREFETCH_COMPLETION");
    const prefetchResult = await prefetchPromises.get(cacheKey);
    if (prefetchResult) return prefetchResult;
  }

  // check cache
  const cached = getCachedInfo(cacheKey, forceRefresh, clientId);
  if (cached) return cached;

  // handle spotify
  if (targetUrl.includes('spotify.com') && !forceRefresh) {
    return handleSpotifyInfo(targetUrl, cacheKey, clientId, onProgress);
  }

  const isYouTube = targetUrl.includes("youtube.com") || targetUrl.includes("youtu.be");

  // handle yt/tiktok
  if ((isYouTube || targetUrl.includes('tiktok.com')) && !forceRefresh) {
    const jsInfo = await handleYoutubeTiktokInfo(targetUrl, cacheKey, cookieArgs, clientId, onProgress);
    if (jsInfo) return jsInfo;
  }

  // handle social
  if (!isYouTube) {
    const socialInfo = await handleSocialJSInfo(targetUrl, cacheKey, cookieArgs, onProgress);
    if (socialInfo) return socialInfo;
  }

  // fallback ytdlp
  const isFbStory = targetUrl.includes('/stories/');
  if (isFbStory) throw new Error("Could not extract Facebook Story media.");

  const info = await runYtdlpInfo(targetUrl, cookieArgs, signal);
  metadataCache.set(cacheKey, { data: info, timestamp: Date.now() });
  return info;
}

export function cacheVideoInfo(url: string, data: unknown, cookieArgs: string[] = []): void {
  const targetUrl = normalizeUrl(url);
  metadataCache.set(`${targetUrl}_${cookieArgs.join("_")}`, { data, timestamp: Date.now() });
}
