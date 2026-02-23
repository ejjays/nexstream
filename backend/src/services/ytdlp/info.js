const { spawn } = require("node:child_process");
const axios = require("axios");
const { COMMON_ARGS, CACHE_DIR, USER_AGENT, REFERER_MAP } = require("./config");
const { acquireLock, releaseLock } = require("./lock");
const { isSupportedUrl } = require("../../utils/validation.util");

const metadataCache = new Map();
const METADATA_EXPIRY = 7200000;

async function expandShortUrl(url) {
  try {
    const parsed = new URL(url);
    const base =
      parsed.hostname === "bili.im"
        ? "https://bili.im"
        : "https://www.facebook.com";
    const safePath = parsed.pathname.match(/^[a-zA-Z0-9\/\-_]+$/)
      ? parsed.pathname
      : "/";
    const safeSearch = parsed.search.match(/^[a-zA-Z0-9\?&=%\-_]+$/)
      ? parsed.search
      : "";
    const res = await axios.head(`${base}${safePath}${safeSearch}`, {
      maxRedirects: 5,
      headers: { "User-Agent": USER_AGENT },
    });
    return res.request.res.responseUrl || url;
  } catch (e) {
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
      "--user-agent",
      USER_AGENT,
      ...COMMON_ARGS,
      "--cache-dir",
      CACHE_DIR,
    ];
    if (referer) args.push("--referer", referer);
    if (targetUrl.includes("youtube.com") || targetUrl.includes("youtu.be")) {
      args.push(
        "--extractor-args",
        "youtube:player_client=web_safari,android_vr,tv;player_skip=configs,webpage,js-variables",
      );
    }
    args.push(targetUrl);

    const proc = spawn("yt-dlp", args);

    if (signal) {
      signal.addEventListener("abort", () => {
        if (proc.exitCode === null) {
          console.log("[ytdlp] Process aborted by signal");
          proc.kill("SIGKILL");
        }
        reject(new Error("Process Aborted"));
      });
    }

    let stdout = "",
      stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d;
    });
    proc.stderr.on("data", (d) => {
      stderr += d;
    });
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr));
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function getVideoInfo(
  url,
  cookieArgs = [],
  forceRefresh = false,
  signal = null,
) {
  const cacheKey = `${url}_${cookieArgs.join("_")}`;
  const cached = metadataCache.get(cacheKey);
  if (
    !forceRefresh &&
    cached &&
    Date.now() - cached.timestamp < METADATA_EXPIRY
  )
    return cached.data;
  if (!isSupportedUrl(url)) throw new Error("Unsupported or malicious URL");

  let targetUrl = url;
  if (url.includes("bili.im") || url.includes("facebook.com/share"))
    targetUrl = await expandShortUrl(url);

  await acquireLock(1);
  try {
    const info = await runYtdlpInfo(targetUrl, cookieArgs, signal);
    metadataCache.set(cacheKey, {
      data: info,
      timestamp: Date.now(),
    });
    return info;
  } finally {
    releaseLock(1);
  }
}

function cacheVideoInfo(url, data, cookieArgs = []) {
  metadataCache.set(`${url}_${cookieArgs.join("_")}`, {
    data,
    timestamp: Date.now(),
  });
}

module.exports = {
  getVideoInfo,
  cacheVideoInfo,
  expandShortUrl,
};
