import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { COMMON_ARGS, CACHE_DIR, USER_AGENT, REFERER_MAP } from "./config.js";
import { isSupportedUrl } from "../../utils/validation.util.js";
import { normalizeUrl } from "../../utils/video.util.js";
import { sendEvent } from "../../utils/sse.util.js";
import { VideoInfo, SpotifyMetadata } from "../../types/index.js";

const metadataCache = new Map<string, { data: VideoInfo; timestamp: number }>();
const prefetchPromises = new Map<string, Promise<any>>();
const METADATA_EXPIRY = 7200000;

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
      "--format-sort", "res,ext:mp4:m4a",
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
      let parsedData: any = null;
      if (stdout.trim()) {
        try { parsedData = JSON.parse(stdout); } catch (e: any) { console.debug('[YtdlpInfo] JSON parse error:', e.message); }
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

      resolve(parsedData as VideoInfo);
    });
  });
}

export async function getVideoInfo(
  url: string, 
  cookieArgs: string[] = [], 
  forceRefresh: boolean = false, 
  signal: AbortSignal | null = null, 
  clientId: string | null = null
): Promise<any> {
  if (!isSupportedUrl(url)) throw new Error("Unsupported or malicious URL");

  let targetUrl = normalizeUrl(url);

  const onProgress = (status: string, progress: number, subStatus?: string, details?: string) => {
    if (clientId) sendEvent(clientId, { 
      status: (status === 'fetching_info' ? 'initializing' : status) as any, 
      progress, 
      subStatus: subStatus || 'Analysing...', 
      details 
    });
  };

  if (targetUrl.includes('http') && targetUrl.lastIndexOf('http') > 0) {
    targetUrl = targetUrl.substring(targetUrl.lastIndexOf('http'));
    console.log(`[Info] Fixed double-pasted URL: ${targetUrl}`);
  }

  const isYouTube = targetUrl.includes("youtube.com") || targetUrl.includes("youtu.be");

  if (url.includes("bili.im") || url.includes("fb.watch") || url.includes("fb.gg") || url.includes("youtu.be") || url.includes("share/") || url.includes("vt.tiktok.com") || url.includes("on.soundcloud.com")) {
    if (clientId) sendEvent(clientId, { status: "initializing", progress: 12, subStatus: "Expanding short-links...", details: "NETWORK: RESOLVING_REDIRECTS" });
    targetUrl = await expandShortUrl(url);
  }

  const cacheKey = `${targetUrl}_${cookieArgs.join("_")}`;

  if (prefetchPromises.has(cacheKey)) {
      if (clientId) sendEvent(clientId, { status: "initializing", progress: 15, subStatus: "Syncing with uplink...", details: "CACHE: AWAITING_PREFETCH_COMPLETION" });
      await prefetchPromises.get(cacheKey);
  }

  const cached = metadataCache.get(cacheKey);
  if (cached && !forceRefresh && (Date.now() - cached.timestamp < METADATA_EXPIRY)) {
    if (clientId) sendEvent(clientId, { status: "initializing", progress: 28, subStatus: "Cache Hit!", details: "REGISTRY: RETRIEVING_PERSISTENT_METADATA" });
    return cached.data;
  }

  if (targetUrl.includes('spotify.com') && !forceRefresh) {
     const { fetchInitialMetadata } = await import('../spotify/metadata.js');
     const spotifyIdx = await import('../spotify/index.js');
     const { getFromBrain } = await import('../spotify/brain.js');
     
     const cachedBrain: any = await getFromBrain(targetUrl);
     if (cachedBrain && cachedBrain.formats) {
        try {
           const brainData = {
              ...cachedBrain,
              imageUrl: cachedBrain.imageUrl || "/logo.webp",
              formats: JSON.parse(cachedBrain.formats || "[]"),
              audioFormats: JSON.parse(cachedBrain.audioFormats || "[]"),
              audioFeatures: JSON.parse(cachedBrain.audioFeatures || "null"),
              targetUrl: cachedBrain.youtubeUrl,
              target_url: cachedBrain.youtubeUrl,
              fromBrain: true,
           };
           
           if (brainData.formats.length > 0 && brainData.target_url) {
              if (clientId) sendEvent(clientId, { text: "registry hit", status: "success" });
              
              const preview = brainData.previewUrl || brainData.preview_url;
              const isExpiringCDN = !preview || 
                                   preview.includes('scdn.co') || 
                                   preview.includes('spotify') || 
                                   preview.includes('dzcdn.net') || 
                                   preview.includes('mzstatic.com') ||
                                   preview.includes('itunes.apple.com');

              if (isExpiringCDN) {
                 await (spotifyIdx as any).refreshPreviewIfNeeded(targetUrl, brainData, onProgress).catch(() => {});
              }
              
              const finalData = {
                 ...brainData,
                 previewUrl: brainData.previewUrl || brainData.preview_url,
                 cover: brainData.imageUrl,
                 thumbnail: brainData.imageUrl,
                 duration: brainData.duration / 1000,
                 is_spotify: true,
                 extractor_key: 'spotify',
                 isPartial: false
              };
              return finalData;
           }
        } catch (e: any) {
           console.warn(`[Info] [Speed] Failed to parse brain data:`, e.message);
        }
     }

     const { metadata }: any = await fetchInitialMetadata(targetUrl, onProgress, Date.now());
     
     if ((spotifyIdx as any).refreshPreviewIfNeeded) {
        await (spotifyIdx as any).refreshPreviewIfNeeded(targetUrl, metadata, onProgress).catch(() => {});
     }

     const resolutionPromise = (async () => {
        try {
           const { runPriorityRace } = await import('../spotify/resolver.js');
           const bestMatch: any = await runPriorityRace(targetUrl, metadata as any, [], onProgress);
           
           if (bestMatch?.url) {
              const matchType = bestMatch.type || 'UNKNOWN';
              const { getInfo } = await import('../extractors/index.js');
              const ytInfo = await getInfo(bestMatch.url);
              if (!ytInfo) throw new Error("Failed to fetch match information.");
              
              const { prepareFinalResponse } = await import('../../utils/response.util.js');
              const finalData: any = await prepareFinalResponse(ytInfo, true, metadata as any, targetUrl);
              finalData.target_url = bestMatch.url;
              finalData.is_spotify = true;
              finalData.is_js_info = true;
              finalData.imageUrl = (metadata as any).imageUrl;
              finalData.isIsrcMatch = !!(matchType === 'ISRC' || matchType === 'Soundcharts');
              finalData.isrc = (metadata as any).isrc;
              finalData.webpage_url = targetUrl;
              
              const ssePayload: any = {
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
              saveToBrain(targetUrl, finalData as unknown as SpotifyMetadata).catch((err: any) => {
                 console.warn(`[Info] [Speed] Failed to save to brain:`, err.message);
              });

              return finalData;
           }
        } catch (e: any) {
           console.warn(`[Info] [Speed] Background resolution failed:`, e.message);
        } finally {
           prefetchPromises.delete(cacheKey);
        }
     })();

     prefetchPromises.set(cacheKey, resolutionPromise);

     return {
        ...metadata,
        cover: (metadata as any).imageUrl,
        thumbnail: (metadata as any).imageUrl,
        is_spotify: true,
        extractor_key: 'spotify',
        formats: [],
        isPartial: true
     };
  }

  if ((isYouTube || targetUrl.includes('tiktok.com')) && !forceRefresh) {
    try {
      const { getInfo } = await import('../extractors/index.js');
      const jsInfo: any = await getInfo(targetUrl, { onProgress });
      if (jsInfo && jsInfo.formats && jsInfo.formats.length > 0) {
        metadataCache.set(cacheKey, { data: jsInfo, timestamp: Date.now() });

        const prefetch = (async () => {
           try {
             const prefetchUrl = jsInfo.target_url || targetUrl;
             const fullInfo: any = await runYtdlpInfo(prefetchUrl, cookieArgs);
             
             fullInfo.is_js_info = true;
             fullInfo.extractor_key = targetUrl.includes('tiktok.com') ? 'tiktok' : 'youtube';
             
             const infoJsonDir = path.join(CACHE_DIR, 'metadata');
             if (!fs.existsSync(infoJsonDir)) fs.mkdirSync(infoJsonDir, { recursive: true });
             const infoJsonPath = path.join(infoJsonDir, `${fullInfo.id}.json`);
             fs.writeFileSync(infoJsonPath, JSON.stringify(fullInfo));
             fullInfo.info_json_path = infoJsonPath;
             
             metadataCache.set(cacheKey, { data: fullInfo, timestamp: Date.now() });
           } catch (e: any) {
             console.warn(`[Prefetch] Background warm-up failed:`, e.message);
           } finally {
             prefetchPromises.delete(cacheKey);
           }
        })();

        prefetchPromises.set(cacheKey, prefetch);

        const { prepareFinalResponse } = await import('../../utils/response.util.js');

        const needsSize = !jsInfo.formats[0]?.filesize || jsInfo.formats[0].filesize === 0;
        if ((isYouTube || targetUrl.includes('tiktok.com')) && needsSize) {
           await Promise.race([prefetch, new Promise(r => setTimeout(r, 300))]);
           const updated = metadataCache.get(cacheKey);
           if (updated && updated.data.formats?.[0]?.filesize) {
               return await prepareFinalResponse(updated.data, false, null, targetUrl);
           }
        }

        return await prepareFinalResponse(jsInfo, false, null, targetUrl);
      }
    } catch (e: any) {
      console.warn(`[Metadata] Engine: Pure-JS URL: ${targetUrl} (Failed: ${e.message})`);
    }
  }

  const isSocial = targetUrl.includes("facebook.com") || targetUrl.includes("instagram.com") || targetUrl.includes("tiktok.com");
  const platform = targetUrl.includes('facebook.com') ? 'Facebook' : 
                   targetUrl.includes('instagram.com') ? 'Instagram' :
                   targetUrl.includes('tiktok.com') ? 'TikTok' : 'Social';

  let jsInfo: any = null;
  if (!isYouTube) {
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
      jsInfo = await getInfo(targetUrl, { 
        cookie: rawCookie || cookieArgs.join('; '),
        onProgress
      });
      
      const hasHD = jsInfo && jsInfo.formats && jsInfo.formats.some((f: any) => 
        (f.resolution && (f.resolution.includes('720') || f.resolution.includes('1080') || f.resolution.includes('HD') || f.resolution.includes('Source'))) ||
        (f.width && f.width >= 720) ||
        (f.format_id && f.format_id.includes('hd_muxed'))
      );

      const isFbStory = targetUrl.includes('/stories/') || (jsInfo?.webpage_url && jsInfo.webpage_url.includes('/stories/'));
      const hasPhoto = jsInfo && jsInfo.formats && jsInfo.formats.some((f: any) => f.format_id === 'photo');
      
      if (isSocial && jsInfo && !hasHD && !isFbStory && !hasPhoto) {
        console.log(`[Metadata] Engine: Pure-JS | Platform: ${platform} | URL: ${targetUrl} (SD only, falling back to yt-dlp for HD)`);
      } else if (jsInfo != null && typeof jsInfo === 'object' && Array.isArray(jsInfo.formats) && jsInfo.formats.length > 0) {
        metadataCache.set(cacheKey, { data: jsInfo, timestamp: Date.now() });
        return jsInfo;
      }
    } catch (e: any) {
      console.warn(`[Metadata] Engine: Pure-JS | Platform: ${platform} | URL: ${targetUrl} (Failed: ${e.message})`);
    }
  }

  const isFbStory = targetUrl.includes('/stories/') || (jsInfo?.webpage_url && jsInfo.webpage_url.includes('/stories/'));
  if (isFbStory) throw new Error("Could not extract Facebook Story media.");

  const info = await runYtdlpInfo(targetUrl, cookieArgs, signal);
  metadataCache.set(cacheKey, { data: info, timestamp: Date.now() });
  return info;
}

export function cacheVideoInfo(url: string, data: any, cookieArgs: string[] = []): void {
  const targetUrl = normalizeUrl(url);
  metadataCache.set(`${targetUrl}_${cookieArgs.join("_")}`, { data, timestamp: Date.now() });
}
