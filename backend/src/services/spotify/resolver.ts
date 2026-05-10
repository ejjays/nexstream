import { spawn } from "node:child_process";

interface SearchResult {
  url: string;
  info: any;
  diff: number;
}

interface MatchResult extends SearchResult {
  type: string;
  priority: number;
}

interface YtdlpService {
  COMMON_ARGS: string[];
  CACHE_DIR: string;
  cacheVideoInfo(url: string, info: any, cookieArgs: string[]): void;
}

async function getYtdlpService(): Promise<YtdlpService> {
  return (await import('../ytdlp.service.js')) as any as YtdlpService;
}

import { refineSearchWithAI } from "./ai.js";
import {
  fetchFromOdesli,
  fetchIsrcFromDeezer,
  fetchIsrcFromItunes,
} from "./external.js";
import { resolveSideTasks } from "./metadata.js";

async function searchOnYoutube(
  query: string,
  cookieArgs: string[],
  targetMetadata: any,
  _onEarlyDispatch: (() => void) | null = null,
  _skipPlayerOptimization: boolean = false,
  signal: AbortSignal | null = null,
): Promise<SearchResult | null> {
  const ytdlp = await getYtdlpService();
  const cleanQuery = query
    .replace(/on Spotify/g, "")
    .replace(/-/g, " ")
    .trim();
  const targetDurationMs = targetMetadata?.duration || 0;
  
  const args = [
    ...cookieArgs,
    "--dump-json",
    "--no-playlist",
    ...ytdlp.COMMON_ARGS,
    "--cache-dir",
    ytdlp.CACHE_DIR,
    `ytsearch1:${cleanQuery}`,
  ];

  return await new Promise<SearchResult | null>((resolve) => {
    const searchProcess = spawn("yt-dlp", args);
    if (signal) {
      signal.addEventListener("abort", () => {
        if (searchProcess.exitCode === null) searchProcess.kill("SIGKILL");
        resolve(null);
      });
    }

    let output = "";
    searchProcess.stdout.on("data", (data) => {
      output += data.toString();
    });
    searchProcess.on("close", (code) => {
      if (code !== 0 || !output) return resolve(null);
      try {
        const info = JSON.parse(output);
        const drift = targetDurationMs > 0 ? Math.abs(info.duration * 1000 - targetDurationMs) : 0;
        ytdlp.cacheVideoInfo(info.webpage_url, info, cookieArgs);
        resolve({ url: info.webpage_url, info, diff: drift });
      } catch (_e) {
        resolve(null);
      }
    });
  });
}

async function priorityRace(
  candidates: any[],
  metadata: any,
  onProgress: any,
  getElapsed: () => string,
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

    const processResult = (result: any, c: any) => {
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
        settle({ ...result, type: c.type, priority: c.priority }, `${c.type} (VERIFIED MATCH)`);
        return;
      }

      if (result.diff < 2000) {
        const p0Candidate = candidates.find(can => can.priority === 0);
        const p0Running = p0Candidate && !p0Candidate.isFinished;

        if (!p0Running) {
          settle({ ...result, type: c.type, priority: c.priority }, `${c.type} (Perfect Match)`);
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
        .then((result: any) => {
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
  targetMetadata?: any,
): Promise<any | null> {
  try {
    const sc = (await import('../extractors/soundcloud.js')) as any;
    const results = await sc.search(query);
    if (!results || results.length === 0) return null;

    const track = results[0];
    const info = await sc.getInfo(track.permalink_url);
    const targetDurationMs = targetMetadata?.duration ?? 0;
    const drift = targetDurationMs > 0 ? Math.abs(info.duration * 1000 - targetDurationMs) : 0;

    return { url: track.permalink_url, info, diff: drift };
  } catch (e: any) {
    console.error(`[Race] SoundCloud search failed:`, e.message);
    return null;
  }
}

export async function runPriorityRace(
  videoURL: string,
  metadata: any,
  cookieArgs: string[],
  onProgress: any,
  soundchartsPromise: Promise<any> | null = null,
): Promise<any> {
  const startTime = Date.now();
  const getElapsed = (): string => ((Date.now() - startTime) / 1000).toFixed(1);
  const candidates: any[] = [];
  const raceController = new AbortController();
  const { signal } = raceController;
  let raceSettled = false;

  onProgress('initializing', 25, 'Staging Multi-Source Search...');

  const isrcPromise = (async (): Promise<any> => {
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
    return searchOnYoutube(`"${isrc}"`, cookieArgs, metadata, null, true, signal);
  })();
  candidates.push({ type: "ISRC", priority: 0, promise: isrcPromise });

  const soundcloudPromise = (async () => {
    await new Promise((r) => setTimeout(r, 200));
    if (raceSettled) return null;
    onProgress("initializing", 40, "Scanning SoundCloud Catalog...");
    return searchOnSoundCloud(`${metadata.title} ${metadata.artist}`, metadata);
  })();
  candidates.push({ type: "SoundCloud", priority: 1, promise: soundcloudPromise });

  const odesliPromise = (async () => {
    if (!videoURL || raceSettled) return null;
    onProgress("initializing", 45, "Consulting Odesli API...");
    const res = await fetchFromOdesli(videoURL).catch(() => null);
    if (!res || raceSettled) return null;
    
    const ytdlp: any = await getYtdlpService();
    const info = await ytdlp
      .getVideoInfo(res.targetUrl, cookieArgs, false, signal)
      .catch(() => null);
    if (!info) return null;

    return {
      url: res.targetUrl,
      info,
      diff: Math.abs(info.duration * 1000 - metadata.duration),
    };
  })();
  candidates.push({ type: "Odesli", priority: 1, promise: odesliPromise });

  const aiPromise = (async () => {
    await new Promise((r) => setTimeout(r, 1000));
    if (raceSettled) return null;
    onProgress("initializing", 55, "Refining Search with AI...");
    const ai = await refineSearchWithAI(metadata).catch(() => null);
    if (!ai?.query || raceSettled) return null;
    
    return searchOnYoutube(ai.query, cookieArgs, metadata, null, false, signal);
  })();
  candidates.push({ type: "AI", priority: 2, promise: aiPromise });

  const cleanArtist = metadata.artist.replace(/\s+(Music|Band|Official|Topic|TV)\s*$/i, "").trim();
  
  if (cleanArtist) {
    const cleanPromise = (async () => {
      await new Promise((r) => setTimeout(r, 500));
      if (raceSettled) return null;
      onProgress("initializing", 65, "Performing Deep Catalog Search...");
      return searchOnYoutube(`${metadata.title} ${cleanArtist}`, cookieArgs, metadata, null, false, signal);
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
      () => {
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
  } catch (err: any) {
    raceSettled = true;
    raceController.abort();
    clearTimeout(raceTimeout);
    throw err;
  }
}
