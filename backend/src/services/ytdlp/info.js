const { spawn } = require("node:child_process");
const { COMMON_ARGS, CACHE_DIR, USER_AGENT, REFERER_MAP } = require("./config");
const { acquireLock, releaseLock } = require("./lock");
const { isSupportedUrl } = require("../../utils/validation.util");
const extractors = require("../extractors");

const metadataCache = new Map();
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

async function getVideoInfo(url, cookieArgs = [], forceRefresh = false, signal = null) {
  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
  const cacheKey = `${url}_${cookieArgs.join("_")}`;

  if (!isSupportedUrl(url)) throw new Error("Unsupported or malicious URL");

  let targetUrl = url;

  // use js fast-path
  if (isYouTube && !forceRefresh) {
    try {
      const jsInfo = await extractors.getInfo(targetUrl);
      if (jsInfo && jsInfo.formats && jsInfo.formats.length > 0) {
        console.log(`[Info] ${targetUrl} handled by JS (Fast-Path)`);
        metadataCache.set(cacheKey, { data: jsInfo, timestamp: Date.now() });
        return jsInfo;
      }
    } catch (e) {
      console.warn(`[Info] JS Fast-Path failed for ${targetUrl}:`, e.message);
    }
  }

  // expand shortened links
  if (url.includes("bili.im") || url.includes("fb.watch") || url.includes("fb.gg") || url.includes("youtu.be"))
    targetUrl = await expandShortUrl(url);

  // try js extractors
  if (!isYouTube) {
    try {
      const jsInfo = await extractors.getInfo(targetUrl);
      if (jsInfo && jsInfo.formats && jsInfo.formats.length > 0) {
        console.log(`[Info] ${targetUrl} handled by JS`);
        metadataCache.set(cacheKey, { data: jsInfo, timestamp: Date.now() });
        return jsInfo;
      }
    } catch (e) {
      console.warn(`[Info] JS Extractor failed for ${targetUrl}, falling back to yt-dlp:`, e.message);
    }
  }

  // fallback to yt-dlp
  console.log(`[Info] ${targetUrl} falling back to yt-dlp`);
  const info = await runYtdlpInfo(targetUrl, cookieArgs, signal);
  metadataCache.set(cacheKey, { data: info, timestamp: Date.now() });
  return info;
}

function cacheVideoInfo(url, data, cookieArgs = []) {
  metadataCache.set(`${url}_${cookieArgs.join("_")}`, { data, timestamp: Date.now() });
}

module.exports = { getVideoInfo, cacheVideoInfo, expandShortUrl };
