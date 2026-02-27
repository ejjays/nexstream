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
  const optimizationArgs = skipPlayerOptimization
    ? "youtube:player_client=web_safari,android_vr,tv"
    : "youtube:player_client=web_safari,android_vr,tv;player_skip=configs,webpage,js-variables";

  const args = [
    ...cookieArgs,
    "--dump-json",
    "--quiet",
    "--no-playlist",
    ...COMMON_ARGS,
    "--extractor-args",
    optimizationArgs,
    "--cache-dir",
    CACHE_DIR,
    `ytsearch1:${cleanQuery}`,
  ];

  await acquireLock(1);
  return new Promise((resolve) => {
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
      releaseLock(1);
      if (code !== 0 || !output) {
        if (query.includes("US") || query.includes("PH")) {
          console.log(`[Quantum Race] ISRC Search yielded 0 results.`);
        }
        return resolve(null);
      }
      try {
        const info = JSON.parse(output);
        const drift =
          targetDurationMs > 0
            ? Math.abs(info.duration * 1000 - targetDurationMs)
            : 0;
        
        const isIsrcSearch = query.startsWith('"') && query.endsWith('"');
        const driftLimit = isIsrcSearch ? 120000 : 15000;

        if (targetDurationMs > 0 && drift > driftLimit) {
          console.log(
            `[Quantum Race] Internal Reject: "${info.title}" drift is ${(drift / 1000).toFixed(1)}s (Limit: ${driftLimit / 1000}s)`,
          );
          return resolve(null);
        }

        if (onEarlyDispatch)
          onEarlyDispatch({
            title: targetMetadata.title,
            artist: targetMetadata.artist,
            cover: targetMetadata.imageUrl,
          });

        if (query.includes("US") || query.includes("PH")) {
          console.log(
            `[Quantum Race] ISRC Search SUCCESS: "${info.title}" (Drift: ${(drift / 1000).toFixed(1)}s)`,
          );
        }

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
        if (finishedCount === candidates.length)
          settle(bestMatch, "All finished");
        return;
      }
      const driftLimit = (c.priority <= 1) ? 120000 : 15000;
      const isGoodMatch = metadata.duration > 0 ? result.diff < driftLimit : true;
      if (!isGoodMatch) {
        console.log(
          `[Quantum Race] Engine ${c.type} rejected: Drift too high (${(result.diff / 1000).toFixed(1)}s, Limit: ${driftLimit / 1000}s)`,
        );
        if (finishedCount === candidates.length)
          settle(bestMatch, "All finished");
        return;
      }
      console.log(
        `[Quantum Race] [+${getElapsed()}s] Early Dispatch: "${metadata.title}"`,
      );
      onProgress("fetching_info", 85, {
        subStatus: "Mapping Authoritative Stream...",
        details: `PRE_SYNC: ${c.type}_ENGINE_MATCH_FOUND`,
        metadata_update: {
          title: metadata.title,
          artist: metadata.artist,
          cover: metadata.imageUrl,
          thumbnail: metadata.imageUrl,
        },
      });

      if (result.diff < 2000) {
        settle(
          { ...result, type: c.type, priority: c.priority },
          `${c.type} (Perfect Match)`,
        );
        return;
      }

      if (c.priority === 0) {
        settle(
          { ...result, type: c.type, priority: c.priority },
          `${c.type} (P0) match`,
        );
      } else if (
        !bestMatch ||
        c.priority < bestMatch.priority ||
        (c.priority === bestMatch.priority && result.diff < bestMatch.diff)
      ) {
        bestMatch = { ...result, type: c.type, priority: c.priority };
        const waitTime = calculateWaitTime(
          candidates.some((cand) => cand.priority === 0),
          metadata.duration > 0 && result.diff < 2000,
          c.priority,
        );
        if (graceTimer) clearTimeout(graceTimer);
        graceTimer = setTimeout(
          () => settle(bestMatch, "Grace expired"),
          waitTime,
        );
      }
      if (finishedCount === candidates.length)
        settle(bestMatch, "All finished");
    };

    candidates.forEach((c) => {
      c.promise
        .then((result) => processResult(result, c))
        .catch(() => {
          if (!isSettled) {
            finishedCount++;
            if (finishedCount === candidates.length)
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
    if (!isrc || !metadata.previewUrl) {
      const [dData, iData] = await Promise.all([
        fetchIsrcFromDeezer(
          metadata.title,
          metadata.artist,
          isrc || metadata.isrc,
          metadata.duration,
        ),
        fetchIsrcFromItunes(
          metadata.title,
          metadata.artist,
          isrc || metadata.isrc,
          metadata.duration,
        ),
      ]);
      const newPreview = dData?.preview || iData?.preview;
      if (newPreview && !metadata.previewUrl) {
        onProgress("fetching_info", 25, {
          metadata_update: { previewUrl: newPreview },
        });
        metadata.previewUrl = newPreview;
      }
      if (!isrc) isrc = dData?.isrc || iData?.isrc;
    }
    if (!isrc || raceSettled) return null;
    safeProgress("fetching_info", 40, { details: `ISRC_IDENTIFIED: ${isrc}` });
    return searchOnYoutube(
      `"${isrc}"`,
      cookieArgs,
      metadata,
      (early) =>
        safeProgress("fetching_info", 45, {
          metadata_update: { ...early, cover: metadata.imageUrl },
        }),
      true,
      signal,
    );
  })();
  candidates.push({ type: "ISRC", priority: 0, promise: isrcPromise });

  const odesliPromise = (async () => {
    await new Promise((r) => setTimeout(r, 1500));
    if (!videoURL || raceSettled) return null;
    const res = await fetchFromOdesli(videoURL);
    if (!res || raceSettled) return null;
    safeProgress("fetching_info", 30, {
      details: "LINKER: CONSULTING_ODESLI_AGGREGATOR",
      metadata_update: {
        title: metadata.title,
        artist: metadata.artist,
        cover: metadata.imageUrl || res.thumbnailUrl,
      },
    });
    const info = await getVideoInfo(res.targetUrl, cookieArgs, false, signal);
    return {
      url: res.targetUrl,
      info,
      diff: Math.abs(info.duration * 1000 - metadata.duration),
    };
  })();
  candidates.push({ type: "Odesli", priority: 1, promise: odesliPromise });

  const aiPromise = (async () => {
    await new Promise((r) => setTimeout(r, 6000));
    if (raceSettled) return null;
    const ai = await refineSearchWithAI(metadata);
    if (!ai?.query || raceSettled) return null;
    safeProgress("fetching_info", 50, {
      details: "SEMANTIC_ENGINE: SYNTHESIZING_SEARCH_VECTORS",
    });
    return searchOnYoutube(
      ai.query,
      cookieArgs,
      metadata,
      (early) =>
        safeProgress("fetching_info", 50, {
          metadata_update: { ...early, cover: metadata.imageUrl },
        }),
      false,
      signal,
    );
  })();
  candidates.push({ type: "AI", priority: 2, promise: aiPromise });

  const cleanArtist = metadata.artist
    .replace(/\s+(Music|Band|Official|Topic|TV)\s*$/i, "")
    .trim();
  if (cleanArtist) {
    const cleanPromise = (async () => {
      await new Promise((r) => setTimeout(r, 8500));
      if (raceSettled) return null;
      return searchOnYoutube(
        `${metadata.title} ${cleanArtist}`,
        cookieArgs,
        metadata,
        (early) =>
          safeProgress("fetching_info", 55, {
            metadata_update: { ...early, cover: metadata.imageUrl },
          }),
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
      isrcPromise,
      resolveSideTasks(videoURL, metadata),
    ]);

    if (
      isrcResult &&
      (!bestMatch || (bestMatch.type !== "ISRC" && isrcResult.diff <= 2000))
    )
      return { ...isrcResult, type: "ISRC", priority: 0 };
    return bestMatch;
  } catch (err) {
    raceSettled = true;
    raceController.abort("error");
    clearTimeout(raceTimeout);
    throw new Error("Search timed out or failed. Please try again.");
  }
}

module.exports = {
  runPriorityRace,
};
