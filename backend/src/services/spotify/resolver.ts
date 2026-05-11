import { spawn } from "node:child_process";
import { VideoInfo } from "../../types/index.js";

interface SearchResult {
  url: string;
  info: VideoInfo;
  diff: number;
}

interface MatchResult extends SearchResult {
  type: string;
  priority: number;
}

interface YtdlpService {
  COMMON_ARGS: string[];
  CACHE_DIR: string;
  cacheVideoInfo(url: string, info: VideoInfo, cookieArgs: string[]): void;
  getVideoInfo(url: string, cookieArgs: string[], forceRefresh?: boolean, signal?: AbortSignal | null): Promise<VideoInfo | null>;
}

async function getYtdlpService(): Promise<YtdlpService> {
  return (await import('../ytdlp.service.js')) as unknown as YtdlpService;
}

import { refineSearchWithAI, AIQueryResult } from "./ai.js";
import {
  fetchFromOdesli,
  fetchIsrcFromDeezer,
  fetchIsrcFromItunes,
} from "./external.js";
import { resolveSideTasks } from "./metadata.js";

async function searchOnYoutube(
  query: string,
  cookieArgs: string[],
  targetMetadata: { duration?: number },
  _onEarlyDispatch: (() => void) | null = null,
  _skipPlayerOptimization = false,
  signal: AbortSignal | null = null,
  retryCount = 0
): Promise<SearchResult | null> {
  const cleanQuery = query
    .replace(/on Spotify/g, "")
    .replace(/-/g, " ")
    .trim();
  const targetDurationMs = targetMetadata?.duration || 0;

  try {
    const { getYoutubeClient } = await import('../extractors/youtube/client.js');
    const { normalizeVideoInfo } = await import('../extractors/youtube/normalizer.js');
    const { processVideoFormats } = await import('../../utils/format.util.js');
    
    const yt = await getYoutubeClient();
    const results = await yt.search(cleanQuery, { type: 'video' });
    
    if (!results || !results.videos || results.videos.length === 0) {
        throw new Error("No videos found");
    }

    const firstVideo = results.videos[0];
    const videoId = firstVideo.id;
    
    // We only need basic metadata for the resolver race, so we skip full format resolution
    // to keep it fast, but we mock the VideoInfo structure so it matches expected types.
    const durationSeconds = (firstVideo.duration?.seconds || 0);
    const durationMs = durationSeconds * 1000;
    const drift = (targetDurationMs > 0 && durationMs > 0) ? Math.abs(durationMs - targetDurationMs) : 0;
    
    const webpage_url = `https://www.youtube.com/watch?v=${videoId}`;
    
    const info: VideoInfo = {
        id: videoId,
        title: firstVideo.title?.toString() || "",
        uploader: firstVideo.author?.name || "",
        author: firstVideo.author?.name || "",
        thumbnail: firstVideo.thumbnails?.[0]?.url || "",
        webpage_url,
        duration: durationSeconds,
        formats: [], // Fast path: don't fetch heavy formats yet
        extractor_key: 'youtube',
        is_js_info: true
    };

    const ytdlp = await getYtdlpService();
    ytdlp.cacheVideoInfo(webpage_url, info, cookieArgs);

    return { url: webpage_url, info, diff: drift };

  } catch (error: any) {
    if (retryCount < 1 && !signal?.aborted) {
      console.log(`[YouTubeSearch] Retrying query via JS: ${cleanQuery}`);
      await new Promise(r => setTimeout(r, 1000));
      return searchOnYoutube(query, cookieArgs, targetMetadata, _onEarlyDispatch, _skipPlayerOptimization, signal, retryCount + 1);
    }
    console.debug(`[YouTubeSearch] Error (JS): ${error.message}`);
    return null;
  }
}

async function priorityRace(
  candidates: Array<{ type: string, priority: number, promise: Promise<SearchResult | null>, isFinished?: boolean }>,
  metadata: { duration: number },
  onProgress: (stage: string, progress: number, message?: string, details?: string) => void,
  _getElapsed: () => string,
  settleCallback: (reason: string) => void = () => {},
): Promise<MatchResult | null> {
  return new Promise<MatchResult | null>((resolve) => {
    let bestMatch: MatchResult | null = null,
      finishedCount = 0,
      isSettled = false;
    
    const settle = (match: MatchResult | null, reason: string = "") => {
      if (!isSettled) {
        isSettled = true;
        settleCallback(reason);
        resolve(match);
      }
    };

    const processResult = (result: SearchResult | null, c: { type: string, priority: number, isFinished?: boolean }) => {
      if (isSettled) return;
      finishedCount++;
      
      if (!result) {
        if (finishedCount >= candidates.length) {
            setTimeout(() => settle(bestMatch, "Consensus reached"), 500);
        }
        return;
      }

      const driftLimit = (c.priority <= 1) ? 120000 : 25000;
      const isGoodMatch = metadata.duration > 0 ? result.diff < driftLimit : true;
      
      if (!isGoodMatch) {
        if (finishedCount >= candidates.length && !bestMatch) {
            setTimeout(() => settle(null, "No suitable candidates"), 500);
        }
        return;
      }

      if (c.priority === 0) {
        settle({ ...result, type: c.type, priority: c.priority }, (c.type + " (VERIFIED MATCH)"));
        return;
      }

      if (result.diff < 2000) {
        const p0Candidate = candidates.find(can => can.priority === 0);
        const p0Running = p0Candidate && !p0Candidate.isFinished;

        if (!p0Running) {
          settle({ ...result, type: c.type, priority: c.priority }, (c.type + " (Perfect Match)"));
          return;
        } else {
          if (!bestMatch || c.priority < bestMatch.priority) {
            bestMatch = { ...result, type: c.type, priority: c.priority };
          }
        }
      }

      if (!bestMatch || c.priority < bestMatch.priority || (c.priority === bestMatch.priority && result.diff < bestMatch.diff)) {
        bestMatch = { ...result, type: c.type, priority: c.priority };
      }

      if (finishedCount >= candidates.length) {
        settle(bestMatch, "Consensus reached");
      }
    };

    candidates.forEach((c) => {
      c.isFinished = false;
      c.promise
        .then((result: SearchResult | null) => {
          c.isFinished = true;
          processResult(result, c);
        })
        .catch(() => {
          c.isFinished = true;
          if (!isSettled) {
            finishedCount++;
            if (finishedCount >= candidates.length)
              settle(bestMatch, "Consensus reached");
          }
        });
    });
  });
}

async function searchOnSoundCloud(
  query: string,
  targetMetadata?: { duration: number },
): Promise<SearchResult | null> {
  try {
    const sc = (await import('../extractors/soundcloud.js')) as any;
    const results = await sc.search(query);
    if (!results || results.length === 0) return null;

    const track = results[0];
    const info = await sc.getInfo(track.permalink_url);
    const targetDurationMs = targetMetadata?.duration ?? 0;
    const drift = targetDurationMs > 0 ? Math.abs(info.duration * 1000 - targetDurationMs) : 0;

    return { url: track.permalink_url, info, diff: drift };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Race] SoundCloud search failed: " + message);
    return null;
  }
}

export async function runPriorityRace(
  videoURL: string,
  metadata: { title: string, artist: string, duration: number, isrc?: string, album?: string, year?: string | number },
  cookieArgs: string[],
  onProgress: (stage: string, progress: number, message?: string, details?: string) => void,
  soundchartsPromise: Promise<{ isrc?: string } | null> | null = null,
): Promise<MatchResult | null> {
  const startTime = Date.now();
  const getElapsed = (): string => ((Date.now() - startTime) / 1000).toFixed(1);
  const candidates: Array<{ type: string, priority: number, promise: Promise<SearchResult | null>, isFinished?: boolean }> = [];
  const raceController = new AbortController();
  const { signal } = raceController;
  let raceSettled = false;

  onProgress('initializing', 25, 'Staging Multi-Source Search...');

  const isrcPromise = (async (): Promise<SearchResult | null> => {
    if (raceSettled) return null;
    let isrc: string | null | undefined =
      metadata.isrc ?? (soundchartsPromise ? (await soundchartsPromise)?.isrc : null);

    if (!isrc) {
      const externalData: any = await Promise.race([
        Promise.all([
          fetchIsrcFromDeezer(metadata.title, metadata.artist, null, metadata.duration).catch(() => null),
          fetchIsrcFromItunes(metadata.title, metadata.artist, null, metadata.duration).catch(() => null),
        ]),
        new Promise<[null, null]>(r => setTimeout(() => r([null, null]), 3000)),
      ]);
      isrc = externalData?.[0]?.isrc ?? externalData?.[1]?.isrc;
    }

    if (!isrc || raceSettled) return null;

    onProgress('initializing', 35, 'Running ISRC Quantum Matcher...');
    return searchOnYoutube("\"" + isrc + "\"", cookieArgs, metadata, null, true, signal);
  })();
  candidates.push({ type: "ISRC", priority: 0, promise: isrcPromise });

  const soundcloudPromise = (async (): Promise<SearchResult | null> => {
    await new Promise((r) => setTimeout(r, 200));
    if (raceSettled) return null;
    onProgress("initializing", 40, "Scanning SoundCloud Catalog...");
    return searchOnSoundCloud(metadata.title + " " + metadata.artist, metadata);
  })();
  candidates.push({ type: "SoundCloud", priority: 1, promise: soundcloudPromise });

  const odesliPromise = (async (): Promise<SearchResult | null> => {
    if (!videoURL || raceSettled) return null;
    onProgress("initializing", 45, "Consulting Odesli API...");
    const res = await fetchFromOdesli(videoURL).catch(() => null);
    if (!res?.targetUrl || raceSettled) return null;
    
    const ytdlp = await getYtdlpService();
    const info = await ytdlp
      .getVideoInfo(res.targetUrl, cookieArgs, false, signal)
      .catch(() => null);
    if (!info) return null;

    return {
      url: res.targetUrl,
      info,
      diff: Math.abs((info.duration || 0) * 1000 - metadata.duration),
    };
  })();
  candidates.push({ type: "Odesli", priority: 1, promise: odesliPromise });

  const aiPromise = (async (): Promise<SearchResult | null> => {
    await new Promise((r) => setTimeout(r, 1000));
    if (raceSettled) return null;
    onProgress("initializing", 55, "Refining Search with AI...");
    const ai: AIQueryResult | null = await refineSearchWithAI(metadata as any).catch(() => null);
    if (!ai?.query || raceSettled) return null;
    
    return searchOnYoutube(ai.query, cookieArgs, metadata, null, false, signal);
  })();
  candidates.push({ type: "AI", priority: 2, promise: aiPromise });

  const cleanArtist = metadata.artist.replace(/\s+(Music|Band|Official|Topic|TV)\s*$/i, "").trim();
  
  if (cleanArtist) {
    const cleanPromise = (async (): Promise<SearchResult | null> => {
      await new Promise((r) => setTimeout(r, 500));
      if (raceSettled) return null;
      onProgress("initializing", 65, "Performing Deep Catalog Search...");
      return searchOnYoutube(metadata.title + " " + cleanArtist, cookieArgs, metadata, null, false, signal);
    })();
    candidates.push({ type: "Clean", priority: 2, promise: cleanPromise });
  }

  const raceTimeout = setTimeout(() => {
    if (!raceSettled) raceController.abort();
  }, 45000);

  try {
    const bestMatch = await priorityRace(
      candidates,
      metadata,
      onProgress,
      getElapsed,
      (_reason: string) => {
        raceSettled = true;
        raceController.abort();
        clearTimeout(raceTimeout);
        onProgress("initializing", 80, "Race Completed.");
      },
    );
    const [isrcResult] = await Promise.all([
      isrcPromise.catch(() => null),
      resolveSideTasks(videoURL, metadata).catch(() => null),
    ]);

    if (isrcResult && (!bestMatch || (bestMatch.type !== "ISRC" && isrcResult.diff <= 2000)))
      return { ...isrcResult, type: "ISRC", priority: 0 };
    
    if (!bestMatch) throw new Error("No high-quality YouTube matches found.");

    return bestMatch;
  } catch (err: unknown) {
    raceSettled = true;
    raceController.abort();
    clearTimeout(raceTimeout);
    throw err;
  }
}
