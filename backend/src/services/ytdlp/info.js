const { spawn } = require("node:child_process");
const { COMMON_ARGS, CACHE_DIR, USER_AGENT, REFERER_MAP } = require("./config");
const { acquireLock, releaseLock } = require("./lock");
const { isSupportedUrl } = require("../../utils/validation.util");
const { sendEvent } = require("../../utils/sse.util");
const extractors = require("../extractors");

const metadataCache = new Map();
const prefetchPromises = new Map();
const METADATA_EXPIRY = 7200000;

async function expandShortUrl(url) {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { "User-Agent": USER_AGENT },
      redirect: 'follow'
    });
    return res.url || url;
  } catch (e) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { "User-Agent": USER_AGENT },
        redirect: 'follow'
      });
      return res.url || url;
    } catch (e2) {
      return url;
    }
  }
}

function runYtdlpInfo(targetUrl, cookieArgs, signal = null) {
  return new Promise((resolve, reject) => {
    const referer =
      Object.entries(REFERER_MAP).find(([domain]) =>
        targetUrl.includes(domain),
      )?.[1] || "";
    const args = [
      ...cookieArgs,
      "--dump-json",
      "--format-sort", "res:480,ext:mp4:m4a",
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
      let parsedData = null;
      if (stdout.trim()) {
        try { parsedData = JSON.parse(stdout); } catch (e) {}
      }
      if (code !== 0 && code !== null) {
        console.error(`[yt-dlp-error] Code ${code}: ${stderr.trim()}`);
        if (!parsedData || !parsedData.title) return reject(new Error(stderr || "yt-dlp failed"));
      }
      if (!parsedData) return reject(new Error("yt-dlp returned no valid JSON"));
      resolve(parsedData);
    });
  });
}

function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    if (url.includes('spotify.com')) {
      urlObj.searchParams.delete('si');
      urlObj.searchParams.delete('context');
    }
    if (url.includes('facebook.com') || url.includes('instagram.com') || url.includes('tiktok.com')) {
      urlObj.searchParams.delete('rdid');
      urlObj.searchParams.delete('share_url');
      urlObj.searchParams.delete('fbclid');
      urlObj.searchParams.delete('utm_source');
    }
    return urlObj.toString();
  } catch (e) {
    return url;
  }
}

async function getVideoInfo(url, cookieArgs = [], forceRefresh = false, signal = null, clientId = null) {
  if (!isSupportedUrl(url)) throw new Error("Unsupported or malicious URL");

  let targetUrl = normalizeUrl(url);

  const onProgress = (status, progress, subStatus, details) => {
    if (clientId) sendEvent(clientId, { 
      status: status || 'fetching_info', 
      progress, 
      subStatus: subStatus || 'Analysing...', 
      details 
    });
  };

  // fix double-pasted urls
  if (targetUrl.includes('http') && targetUrl.lastIndexOf('http') > 0) {
    targetUrl = targetUrl.substring(targetUrl.lastIndexOf('http'));
    console.log(`[Info] Fixed double-pasted URL: ${targetUrl}`);
  }

  const isYouTube = targetUrl.includes("youtube.com") || targetUrl.includes("youtu.be");

  // expand links
  if (url.includes("bili.im") || url.includes("fb.watch") || url.includes("fb.gg") || url.includes("youtu.be") || url.includes("share/r") || url.includes("vt.tiktok.com") || url.includes("on.soundcloud.com")) {
    if (clientId) sendEvent(clientId, { status: "fetching_info", progress: 12, subStatus: "Expanding short-links...", details: "NETWORK: RESOLVING_REDIRECTS" });
    targetUrl = await expandShortUrl(url);
  }

  const cacheKey = `${targetUrl}_${cookieArgs.join("_")}`;

  // wait for prefetch
  if (prefetchPromises.has(cacheKey)) {
      if (clientId) sendEvent(clientId, { status: "fetching_info", progress: 15, subStatus: "Syncing with uplink...", details: "CACHE: AWAITING_PREFETCH_COMPLETION" });
      console.log(`[Prefetch] Waiting for ongoing warm-up for ${targetUrl}...`);
      await prefetchPromises.get(cacheKey);
  }

  const cached = metadataCache.get(cacheKey);
  if (cached && !forceRefresh && (Date.now() - cached.timestamp < METADATA_EXPIRY)) {
    if (clientId) sendEvent(clientId, { status: "fetching_info", progress: 28, subStatus: "Cache Hit!", details: "REGISTRY: RETRIEVING_PERSISTENT_METADATA" });
    return cached.data;
  }

  // fast spotify path
  if (targetUrl.includes('spotify.com') && !forceRefresh) {
     console.log(`[Info] [Speed] Initializing Extreme Speed path for Spotify...`);
     const { fetchInitialMetadata } = require('../spotify/metadata');
     const spotifyIdx = require('../spotify/index');
     const { getFromBrain } = require('../spotify/brain');
     
     // check turso brain first
     const cachedBrain = await getFromBrain(targetUrl);
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
              console.log(`[Info] [Speed] Turso Brain Hit: ${brainData.title}`);
              if (clientId) sendEvent(clientId, { text: "registry hit", type: "success" });
              
              // refresh preview
              const preview = brainData.previewUrl || brainData.preview_url;
              const isExpiringCDN = !preview || 
                                   preview.includes('scdn.co') || 
                                   preview.includes('spotify') || 
                                   preview.includes('dzcdn.net') || 
                                   preview.includes('mzstatic.com') ||
                                   preview.includes('itunes.apple.com');

              if (isExpiringCDN) {
                 console.log(`[Info] [Preview] Refreshing preview for ${brainData.title}...`);
                 await spotifyIdx.refreshPreviewIfNeeded(targetUrl, brainData, onProgress).catch(() => {});
              }
              
              const finalData = {
                 ...brainData,
                 previewUrl: brainData.previewUrl || brainData.preview_url,
                 cover: brainData.imageUrl,
                 thumbnail: brainData.imageUrl,
                 duration: brainData.duration / 1000, // convert ms to s
                 is_spotify: true,
                 extractor_key: 'spotify',
                 isPartial: false
              };
              console.log(`[Info] [Speed] Returning Brain Data. Preview: ${finalData.previewUrl ? 'YES' : 'NO'}`);
              return finalData;
           } else if (brainData.formats.length > 0) {
              console.log(`[Info] [Speed] Brain Hit found but targetUrl missing for ${brainData.title}. Proceeding to resolution.`);
           }
        } catch (e) {
           console.warn(`[Info] [Speed] Failed to parse brain data:`, e.message);
        }
     }

     // fetch spotify metadata
     const { metadata } = await fetchInitialMetadata(targetUrl, onProgress, Date.now());
     
     // refresh preview
     if (spotifyIdx.refreshPreviewIfNeeded) {
        await spotifyIdx.refreshPreviewIfNeeded(targetUrl, metadata, onProgress).catch(() => {});
     }

     // resolve background
     const resolutionPromise = (async () => {
        try {
           const { runPriorityRace } = require('../spotify/resolver');
           const bestMatch = await runPriorityRace(targetUrl, metadata, [], onProgress);
           
           if (bestMatch?.url) {
              const matchType = bestMatch.type || 'UNKNOWN';
              console.log(`[Info] [Speed] Background resolution success (${matchType}): ${bestMatch.url}`);
              const extractors = require("../extractors");
              const ytInfo = await extractors.getInfo(bestMatch.url);
              
              // process response
              const { prepareFinalResponse } = require('../../utils/response.util');
              const finalData = await prepareFinalResponse(ytInfo, true, metadata, targetUrl);
              finalData.target_url = bestMatch.url;
              finalData.is_spotify = true;
              finalData.is_js_info = true;
              finalData.imageUrl = metadata.imageUrl; // Preserve for next cache hit
              finalData.isIsrcMatch = !!(matchType === 'ISRC' || matchType === 'Soundcharts');
              finalData.isrc = metadata.isrc;
              finalData.webpage_url = targetUrl;
              
              // send SSE update
              const ssePayload = {
                 status: "success",
                 text: "Resolution complete.",
                 type: "success",
                 metadata_update: {
                    ...finalData,
                    isFullData: true, // Signal to frontend that formats are now available
                    isPartial: false
                 }
              };

              // wait for mount
              await new Promise(r => setTimeout(r, 500)); 
              
              console.log(`[Info] [Speed] Dispatching resolution update for ${clientId}`);
              
              // save JSON cache
              try {
                 const fs = require('fs');
                 const path = require('path');
                 const youtubeId = bestMatch.url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1];
                 if (youtubeId) {
                    const infoJsonDir = path.join(CACHE_DIR, 'metadata');
                    if (!fs.existsSync(infoJsonDir)) fs.mkdirSync(infoJsonDir, { recursive: true });
                    const infoJsonPath = path.join(infoJsonDir, `${youtubeId}.json`);
                    fs.writeFileSync(infoJsonPath, JSON.stringify({ ...ytInfo, id: youtubeId }));
                    finalData.info_json_path = infoJsonPath;
                 }
              } catch (e) {
                 console.warn(`[Info] [Speed] Failed to save JSON cache:`, e.message);
              }

              metadataCache.set(cacheKey, { data: finalData, timestamp: Date.now() });
              if (clientId) sendEvent(clientId, ssePayload);
              
              // save to brain
              const { saveToBrain } = require('../spotify.service');
              saveToBrain(targetUrl, finalData).catch((err) => {
                 console.warn(`[Info] [Speed] Failed to save to brain:`, err.message);
              });

              return finalData;
           }
        } catch (e) {
           console.warn(`[Info] [Speed] Background resolution failed:`, e.message);
           if (clientId) sendEvent(clientId, { text: "Heavy-lift resolution failed. Using limited streams.", type: "warning" });
        } finally {
           prefetchPromises.delete(cacheKey);
        }
     })();

     prefetchPromises.set(cacheKey, resolutionPromise);

     // return initial data
     return {
        ...metadata,
        cover: metadata.imageUrl,
        thumbnail: metadata.imageUrl,
        is_spotify: true,
        extractor_key: 'spotify',
        formats: [], // Frontend handles empty formats by showing "Resolving streams..."
        isPartial: true
     };
  }

  // fast path
  if ((isYouTube || targetUrl.includes('tiktok.com')) && !forceRefresh) {
    try {
      const jsInfo = await extractors.getInfo(targetUrl, { onProgress });
      if (jsInfo && jsInfo.formats && jsInfo.formats.length > 0) {
        console.log(`[Info] ${targetUrl} handled by JS (Fast-Path)`);
        if (clientId) sendEvent(clientId, { text: "bypass locked", type: "success" });
        metadataCache.set(cacheKey, { data: jsInfo, timestamp: Date.now() });

        // init prefetch
        const prefetch = (async () => {
           try {
             const prefetchUrl = jsInfo.target_url || targetUrl;
             console.log(`[Prefetch] Warming up cache for ${prefetchUrl}...`);
             if (clientId) sendEvent(clientId, { text: "warming hyper-drive...", type: "info" });
             const fullInfo = await runYtdlpInfo(prefetchUrl, cookieArgs);
             
             // tag direct path
             fullInfo.is_js_info = true;
             fullInfo.extractor_key = targetUrl.includes('tiktok.com') ? 'tiktok' : 'youtube';
             
             const fs = require('fs');
             const path = require('path');
             const infoJsonDir = path.join(CACHE_DIR, 'metadata');
             if (!fs.existsSync(infoJsonDir)) fs.mkdirSync(infoJsonDir, { recursive: true });
             const infoJsonPath = path.join(infoJsonDir, `${fullInfo.id}.json`);
             fs.writeFileSync(infoJsonPath, JSON.stringify(fullInfo));
             fullInfo.info_json_path = infoJsonPath;
             
             metadataCache.set(cacheKey, { data: fullInfo, timestamp: Date.now() });
             console.log(`[Prefetch] ${targetUrl} is ready for instant download`);
             if (clientId) sendEvent(clientId, { text: "core ready", type: "success" });
           } catch (e) {
             console.warn(`[Prefetch] Background warm-up failed:`, e.message);
           } finally {
             prefetchPromises.delete(cacheKey);
           }
        })();

        prefetchPromises.set(cacheKey, prefetch);

        const { prepareFinalResponse } = require('../../utils/response.util');

        // wait for size
        const needsSize = !jsInfo.formats[0]?.filesize || jsInfo.formats[0].filesize === 0;
        if ((isYouTube || targetUrl.includes('tiktok.com')) && needsSize) {
           console.log(`[Info] Waiting for ${isYouTube ? 'YouTube' : 'TikTok'} metadata (Size/HD)...`);
           await Promise.race([
               prefetch,
               new Promise(r => setTimeout(r, 300))
           ]);
           const updated = metadataCache.get(cacheKey);
           if (updated && updated.data.formats?.[0]?.filesize) {
               return await prepareFinalResponse(updated.data, false, null, targetUrl);
           }
        }

        return await prepareFinalResponse(jsInfo, false, null, targetUrl);
        }

    } catch (e) {
      console.warn(`[Info] JS Fast-Path failed for ${targetUrl}:`, e.message);
    }
  }

  const isSocial = targetUrl.includes("facebook.com") || targetUrl.includes("instagram.com") || targetUrl.includes("tiktok.com");
  const hasCookies = cookieArgs && cookieArgs.length > 0;

  if (!isYouTube) {
    // try js extractor
    try {
      // parse cookies
      let rawCookie = null;
      if (cookieArgs && cookieArgs.includes('--cookies')) {
          const cookiePath = cookieArgs[cookieArgs.indexOf('--cookies') + 1];
          if (cookiePath && require('fs').existsSync(cookiePath)) {
              const content = require('fs').readFileSync(cookiePath, 'utf8');
              const lines = content.split('\n');
              const pairs = [];
              for (const line of lines) {
                  if (!line.trim() || line.startsWith('#')) continue;
                  const parts = line.split('\t');
                  if (parts.length >= 7) pairs.push(`${parts[5].trim()}=${parts[6].trim()}`);
              }
              rawCookie = pairs.join('; ');
          }
      }

      const jsInfo = await extractors.getInfo(targetUrl, { 
        cookie: rawCookie || cookieArgs.join('; '),
        onProgress
      });
      
      // check hd
      const hasHD = jsInfo && jsInfo.formats && jsInfo.formats.some(f => 
        (f.resolution && (f.resolution.includes('720') || f.resolution.includes('1080') || f.resolution.includes('HD') || f.resolution.includes('Source'))) ||
        (f.width && f.width >= 720)
      );

      // ytdlp fallback
      const isFbStory = targetUrl.includes('/stories/');
      if (isSocial && jsInfo && !hasHD && !isFbStory) {
        console.log(`[Info] JS only found limited formats for ${targetUrl}, trying yt-dlp for higher quality...`);
        if (clientId) sendEvent(clientId, { text: "Low resolution detected. Recalibrating sensors...", type: "info" });
      } else if (jsInfo && jsInfo.formats && jsInfo.formats.length > 0) {
        console.log(`[Info] ${targetUrl} handled by JS${hasHD ? ' (HD)' : ''}`);
        if (clientId) sendEvent(clientId, { text: `Quantum bypass successful (${hasHD ? 'HD' : 'SD'})`, type: "success" });
        metadataCache.set(cacheKey, { data: jsInfo, timestamp: Date.now() });
        return jsInfo;
      }
    } catch (e) {
      console.warn(`[Info] JS Extractor failed for ${targetUrl}:`, e.message);
    }
  }

  // fallback to ytdlp
  console.log(`[Info] ${targetUrl} falling back to yt-dlp`);
  if (clientId) sendEvent(clientId, { status: "fetching_info", progress: 22, subStatus: "Bypassing quantum path...", details: "Using heavy-lift engine" });
  const info = await runYtdlpInfo(targetUrl, cookieArgs, signal);
  metadataCache.set(cacheKey, { data: info, timestamp: Date.now() });
  return info;
}

function cacheVideoInfo(url, data, cookieArgs = []) {
  const targetUrl = normalizeUrl(url);
  metadataCache.set(`${targetUrl}_${cookieArgs.join("_")}`, { data, timestamp: Date.now() });
}

module.exports = { getVideoInfo, cacheVideoInfo, expandShortUrl, normalizeUrl };
