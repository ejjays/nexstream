const { spawn } = require("node:child_process");
const {
  COMMON_ARGS,
  CACHE_DIR,
  getVideoInfo,
  cacheVideoInfo,
  acquireLock,
  releaseLock,
} = require("../ytdlp.service");
const { refineSearchWithAI } = require("./ai");
const {
  fetchFromOdesli,
  fetchIsrcFromDeezer,
  fetchIsrcFromItunes,
} = require("./external");
const { resolveSideTasks } = require("./metadata");

async function searchOnYoutube(
  query,
  cookieArgs,
  targetMetadata,
  onEarlyDispatch = null,
  skipPlayerOptimization = false,
  signal = null,
) {
  const cleanQuery = query
    .replace(/on Spotify/g, "")
    .replace(/-/g, " ")
    .trim();
  const targetDurationMs = targetMetadata?.duration || 0;
  
  const args = [
    ...cookieArgs,
    "--dump-json",
    "--no-playlist",
    ...COMMON_ARGS,
    "--cache-dir",
    CACHE_DIR,
    `ytsearch1:${cleanQuery}`,
  ];

  return await new Promise((resolve) => {
    const searchProcess = spawn("yt-dlp", args);
    if (signal) {
      signal.addEventListener("abort", () => {
        if (searchProcess.exitCode === null) searchProcess.kill("SIGKILL");
        resolve(null);
      });
    }

    let output = "";
    let errorOutput = "";
    searchProcess.stdout.on("data", (data) => {
      output += data.toString();
    });
    searchProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });
    searchProcess.on("close", (code) => {
      if (code !== 0 || !output) {
        if (errorOutput.trim()) {
          console.log(`[Quantum Race] Engine ${query.substring(0, 20)} failed: ${errorOutput.trim().split('\n')[0]}`);
        }
        return resolve(null);
      }
      try {
        const info = JSON.parse(output);
        const drift = targetDurationMs > 0 ? Math.abs(info.duration * 1000 - targetDurationMs) : 0;
        cacheVideoInfo(info.webpage_url, info, cookieArgs);
        resolve({ url: info.webpage_url, info, diff: drift });
      } catch (e) {
        resolve(null);
      }
    });
  });
}

const calculateWaitTime = (hasP0, isPerfect, priority) => {
  if (hasP0) return 15000;
  if (isPerfect) return 2000;
  return priority === 2 ? 3000 : 1500;
};

async function priorityRace(
  candidates,
  metadata,
  onProgress,
  getElapsed,
  settleCallback = () => {},
) {
  return new Promise((resolve) => {
    let bestMatch = null,
      graceTimer = null,
      finishedCount = 0,
      isSettled = false;
    const settle = (match, reason = "") => {
      if (!isSettled) {
        isSettled = true;
        settleCallback(reason);
        if (graceTimer) clearTimeout(graceTimer);
        resolve(match);
      }
    };

    const processResult = (result, c) => {
      if (isSettled) return;
      finishedCount++;
      
      if (!result) {
        console.log(`[Quantum Race] Engine ${c.type} returned NO results.`);
        if (finishedCount >= candidates.length) {
            setTimeout(() => settle(bestMatch, "All finished"), 500);
        }
        return;
      }

      console.log(`[Quantum Race] Engine ${c.type} found: "${result.info?.title}" (${(result.info?.duration).toFixed(1)}s)`);

      const driftLimit = (c.priority <= 1) ? 120000 : 25000;
      const isGoodMatch = metadata.duration > 0 ? result.diff < driftLimit : true;
      
      if (!isGoodMatch) {
        console.log(`[Quantum Race] Engine ${c.type} rejected (Drift: ${(result.diff / 1000).toFixed(1)}s)`);
        if (finishedCount >= candidates.length && !bestMatch) {
            setTimeout(() => settle(null, "No suitable candidates"), 500);
        }
        return;
      }

      if (result.diff < 2000) {
        settle({ ...result, type: c.type, priority: c.priority }, `${c.type} (Perfect Match)`);
        return;
      }

      if (!bestMatch || c.priority < bestMatch.priority || (c.priority === bestMatch.priority && result.diff < bestMatch.diff)) {
        bestMatch = { ...result, type: c.type, priority: c.priority };
      }

      if (finishedCount >= candidates.length) {
        settle(bestMatch, "Consensus reached");
      }
    };

    candidates.forEach((c) => {
      c.promise
        .then((result) => processResult(result, c))
        .catch(() => {
          if (!isSettled) {
            finishedCount++;
            if (finishedCount >= candidates.length)
              settle(bestMatch, "Consensus reached");
          }
        });
    });
  });
}

async function runPriorityRace(
  videoURL,
  metadata,
  cookieArgs,
  onProgress,
  soundchartsPromise = null,
) {
  const startTime = Date.now(),
    getElapsed = () => ((Date.now() - startTime) / 1000).toFixed(1),
    candidates = [];
  const raceController = new AbortController();
  const { signal } = raceController;
  let raceSettled = false;

  const safeProgress = (status, progress, extra) => {
    if (!raceSettled) onProgress(status, progress, extra);
  };

  console.log(
    `[Quantum Race] [+${getElapsed()}s] Starting staggered engines (ISRC prioritized)...`,
  );
  onProgress("fetching_info", 25, {
    subStatus: "Staging Multi-Source Search...",
    details: "THREADS: ISRC_FIRST_STRATEGY_ACTIVE",
  });

  const isrcPromise = (async () => {
    if (raceSettled) return null;
    let isrc =
      metadata.isrc ||
      (soundchartsPromise ? (await soundchartsPromise)?.isrc : null);
    
    if (!isrc) {
      // handle isrc timeout
      const externalData = await Promise.race([
        Promise.all([
            fetchIsrcFromDeezer(metadata.title, metadata.artist, null, metadata.duration).catch(() => null),
            fetchIsrcFromItunes(metadata.title, metadata.artist, null, metadata.duration).catch(() => null),
        ]),
        new Promise(r => setTimeout(() => r([null, null]), 3000))
      ]);
      isrc = externalData[0]?.isrc || externalData[1]?.isrc;
    }

    if (!isrc || raceSettled) return null;

    onProgress("fetching_info", 35, {
      subStatus: "Running ISRC Quantum Matcher...",
      details: "ENGINE_ISRC: SCANNING_YOUTUBE_REGISTRY"
    });

    return searchOnYoutube(`"${isrc}"`, cookieArgs, metadata, null, true, signal);
  })();
  candidates.push({ type: "ISRC", priority: 0, promise: isrcPromise });

  const odesliPromise = (async () => {
    if (!videoURL || raceSettled) return null;
    console.log(`[Quantum Race] Engine Odesli starting...`);
    onProgress("fetching_info", 45, {
      subStatus: "Consulting Odesli API...",
      details: "ENGINE_ODESLI: RESOLVING_METADATA_LINKS"
    });
    const res = await fetchFromOdesli(videoURL).catch(() => null);
    if (!res || raceSettled) return null;
    
    const info = await getVideoInfo(res.targetUrl, cookieArgs, false, signal).catch(() => null);
    if (!info) return null;

    return {
      url: res.targetUrl,
      info,
      diff: Math.abs(info.duration * 1000 - metadata.duration),
    };
  })();
  candidates.push({ type: "Odesli", priority: 1, promise: odesliPromise });

  const aiPromise = (async () => {
    // start ai search
    await new Promise((r) => setTimeout(r, 1000));
    if (raceSettled) return null;
    console.log(`[Quantum Race] Engine AI starting...`);
    onProgress("fetching_info", 55, {
      subStatus: "Refining Search with AI...",
      details: "ENGINE_AI: OPTIMIZING_QUERY_PARAMS"
    });
    const ai = await refineSearchWithAI(metadata).catch(() => null);
    if (!ai?.query || raceSettled) return null;
    
    return searchOnYoutube(ai.query, cookieArgs, metadata, null, false, signal);
  })();
  candidates.push({ type: "AI", priority: 2, promise: aiPromise });

  const cleanArtist = metadata.artist
    .replace(/\s+(Music|Band|Official|Topic|TV)\s*$/i, "")
    .trim();
  
  if (cleanArtist) {
    const cleanPromise = (async () => {
      // start clean search
      await new Promise((r) => setTimeout(r, 500));
      if (raceSettled) return null;
      console.log(`[Quantum Race] Engine Clean starting...`);
      onProgress("fetching_info", 65, {
        subStatus: "Performing Deep Catalog Search...",
        details: "ENGINE_CLEAN: FINAL_VALIDATION_STAGING"
      });
      return searchOnYoutube(
        `${metadata.title} ${cleanArtist}`,
        cookieArgs,
        metadata,
        null,
        false,
        signal,
      );
    })();
    candidates.push({ type: "Clean", priority: 2, promise: cleanPromise });
  }

  const raceTimeout = setTimeout(() => {
    if (!raceSettled) raceController.abort("timeout");
  }, 45000);

  try {
    const bestMatch = await priorityRace(
      candidates,
      metadata,
      onProgress,
      getElapsed,
      (reason) => {
        raceSettled = true;
        raceController.abort("settled");
        clearTimeout(raceTimeout);
        console.log(
          `[Quantum Race] [+${getElapsed()}s] SETTLED: ${reason.toUpperCase()}`,
        );
        onProgress("fetching_info", 80, {
          subStatus: "Race Completed.",
          details: `SETTLED: ${reason.toUpperCase().split(" ")[0]}`,
        });
      },
    );
    const [isrcResult] = await Promise.all([
      isrcPromise.catch(() => null),
      resolveSideTasks(videoURL, metadata).catch(() => null),
    ]);

    if (
      isrcResult &&
      (!bestMatch || (bestMatch.type !== "ISRC" && isrcResult.diff <= 2000))
    )
      return { ...isrcResult, type: "ISRC", priority: 0 };
    
    if (!bestMatch) {
        console.log(`[Quantum Race] No candidates survived. Search failed.`);
        throw new Error("No high-quality YouTube matches found for this track.");
    }

    return bestMatch;
  } catch (err) {
    raceSettled = true;
    raceController.abort("error");
    clearTimeout(raceTimeout);
    console.error(`[Quantum Race] Fatal Error: ${err.message}`);
    throw err;
  }
}

module.exports = {
  runPriorityRace,
};
