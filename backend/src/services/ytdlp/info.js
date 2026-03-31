const { spawn } = require("node:child_process");
const axios = require("axios");
const { COMMON_ARGS, CACHE_DIR, USER_AGENT, REFERER_MAP } = require("./config");
const { acquireLock, releaseLock } = require("./lock");
const { isSupportedUrl } = require("../../utils/validation.util");
const extractors = require("../extractors");

const metadataCache = new Map();
const METADATA_EXPIRY = 7200000;

async function expandShortUrl(url) {
  try {
    const res = await axios.head(url, {
      maxRedirects: 5,
      headers: { "User-Agent": USER_AGENT },
    });
    return res.request.res.responseUrl || url;
  } catch (e) {
    if (e.response?.status === 405) {
      try {
        const res = await axios.get(url, {
          maxRedirects: 5,
          headers: { "User-Agent": USER_AGENT },
          responseType: 'stream'
        });
        res.data.destroy();
        return res.request.res.responseUrl || url;
      } catch (e2) {
        return url;
      }
    }
    return url;
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
        if (!parsedData || !parsedData.title) return reject(new Error(stderr || "yt-dlp failed"));
      }
      if (!parsedData) return reject(new Error("yt-dlp returned no valid JSON"));
      resolve(parsedData);
    });
  });
}

async function getVideoInfo(url, cookieArgs = [], forceRefresh = false, signal = null) {
  const cacheKey = `${url}_${cookieArgs.join("_")}`;
  const cached = metadataCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < METADATA_EXPIRY) return cached.data;

  if (!isSupportedUrl(url)) throw new Error("Unsupported or malicious URL");

  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
  let targetUrl = url;

  // try js path
  if (isYouTube) {
    const jsInfo = await extractors.getInfo(targetUrl);
    if (jsInfo) {
      console.log(`[Info] ${targetUrl} handled by JS (Fast-Path)`);
      metadataCache.set(cacheKey, { data: jsInfo, timestamp: Date.now() });
      return jsInfo;
    }
  }

  // expand other shorteners
  if (url.includes("bili.im") || url.includes("fb.watch") || url.includes("fb.gg") || url.includes("youtu.be"))
    targetUrl = await expandShortUrl(url);

  // try js fallback
  const jsInfo = isYouTube ? null : await extractors.getInfo(targetUrl);
  if (jsInfo) {
    console.log(`[Info] ${targetUrl} handled by JS`);
    metadataCache.set(cacheKey, { data: jsInfo, timestamp: Date.now() });
    return jsInfo;
  }

  console.log(`[Info] ${targetUrl} falling back to yt-dlp`);
  const info = await runYtdlpInfo(targetUrl, cookieArgs, signal);
  metadataCache.set(cacheKey, { data: info, timestamp: Date.now() });
  return info;
}

function cacheVideoInfo(url, data, cookieArgs = []) {
  metadataCache.set(`${url}_${cookieArgs.join("_")}`, { data, timestamp: Date.now() });
}

module.exports = { getVideoInfo, cacheVideoInfo, expandShortUrl };
