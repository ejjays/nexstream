const { spawn } = require("node:child_process");
const fs = require("node:fs");
const { PassThrough } = require("node:stream");
const { COMMON_ARGS, CACHE_DIR, USER_AGENT } = require("./config");
const { getVideoInfo } = require("./info");

function getNetscapeCookieString(cookiesFile, targetUrl) {
  if (!cookiesFile || !fs.existsSync(cookiesFile)) return "";
  try {
    const domain = new URL(targetUrl).hostname.split(".").slice(-2).join(".");
    return fs
      .readFileSync(cookiesFile, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes(domain))
      .map((l) => {
        const p = l.split("\t");
        return `${p[5]}=${p[6]}`;
      })
      .join("; ");
  } catch {
    return "";
  }
}

function handleMp3Stream(url, formatId, cookieArgs, preFetchedInfo) {
  const combinedStdout = new PassThrough(),
    eventBus = new (require("node:events"))();
  let ffmpegProcess = null;
  const proxy = {
    stdout: combinedStdout,
    kill: () => {
      if (ffmpegProcess?.exitCode === null) ffmpegProcess.kill("SIGKILL");
    },
    on: (event, cb) =>
      event === "close"
        ? eventBus.on("close", cb)
        : combinedStdout.on(event, cb),
    get exitCode() {
      return ffmpegProcess?.exitCode;
    },
  };

  (async () => {
    try {
      let info = preFetchedInfo;
      let audioFormat = info?.formats?.find(
        (f) => f.format_id === formatId && f.url,
      );
      if (!audioFormat) {
        info = info || (await getVideoInfo(url, cookieArgs));
        audioFormat =
          info.formats.find((f) => f.format_id === formatId) ||
          info.formats
            .filter((f) => f.acodec !== "none")
            .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
      }
      if (!audioFormat?.url) throw new Error("No audio URL");

      const referer =
        info?.http_headers?.["Referer"] || info?.webpage_url || "";
      const cookiesFile = cookieArgs.join(" ").includes("--cookies")
        ? cookieArgs[cookieArgs.indexOf("--cookies") + 1]
        : null;
      const cookieString = getNetscapeCookieString(
        cookiesFile,
        audioFormat.url,
      );

      ffmpegProcess = spawn("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-reconnect",
        "1",
        "-reconnect_streamed",
        "1",
        "-reconnect_delay_max",
        "5",
        "-user_agent",
        USER_AGENT,
        ...(referer ? ["-referer", referer] : []),
        ...(cookieString ? ["-cookies", cookieString] : []),
        "-i",
        audioFormat.url,
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        "-f",
        "mp3",
        "pipe:1",
      ]);
      ffmpegProcess.stdout.pipe(combinedStdout);
      ffmpegProcess.on("close", (code) => eventBus.emit("close", code));
    } catch (err) {
      combinedStdout.emit("error", err);
      eventBus.emit("close", 1);
    }
  })();
  return proxy;
}

function handleDoublePipeStream(
  url,
  formatId,
  cookieArgs,
  combinedStdout,
  eventBus,
  proxy,
) {
  const ytdlpProc = spawn("yt-dlp", [
    ...cookieArgs,
    "--user-agent",
    USER_AGENT,
    ...COMMON_ARGS,
    "--cache-dir",
    CACHE_DIR,
    "-f",
    formatId || "best",
    "-o",
    "-",
    url,
  ]);
  const ffmpegProc = spawn("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    "pipe:0",
    "-c",
    "copy",
    "-bsf:a",
    "aac_adtstoasc",
    "-f",
    "mp4",
    "-movflags",
    "frag_keyframe+empty_moov+default_base_moof",
    "pipe:1",
  ]);
  ytdlpProc.stdout.on("data", (chunk) => {
    if (ffmpegProc.stdin.writable) ffmpegProc.stdin.write(chunk);
  });
  ytdlpProc.stdout.on("end", () => {
    if (ffmpegProc.stdin.writable) ffmpegProc.stdin.end();
  });
  ffmpegProc.stdout.pipe(combinedStdout);
  ffmpegProc.on("close", (code) => eventBus.emit("close", code));
  proxy.kill = () => {
    if (ytdlpProc.exitCode === null) ytdlpProc.kill("SIGKILL");
    if (ffmpegProc.exitCode === null) ffmpegProc.kill("SIGKILL");
  };
}

const getBestAudioFormat = (formats) => {
  return (
    formats
      .filter((f) => f.acodec !== "none" && (!f.vcodec || f.vcodec === "none"))
      .sort((a, b) => {
        const aIsAac = a.acodec?.includes("aac"),
          bIsAac = b.acodec?.includes("aac");
        if (aIsAac && !bIsAac) return -1;
        if (!aIsAac && bIsAac) return 1;
        return (b.abr || 0) - (a.abr || 0);
      })[0] || { url: null }
  );
};

const buildFfmpegInputs = (videoFormat, audioFormat, info, cookieArgs) => {
  const referer = info.http_headers?.["Referer"] || info.webpage_url || "";
  const cookiesFile = cookieArgs.join(" ").includes("--cookies")
    ? cookieArgs[cookieArgs.indexOf("--cookies") + 1]
    : null;
  const inputs = [];
  const addInput = (format) => {
    inputs.push("-user_agent", USER_AGENT);
    if (referer) inputs.push("-referer", referer);
    const cookies = getNetscapeCookieString(cookiesFile, format.url);
    if (cookies) inputs.push("-cookies", cookies);
    inputs.push("-i", format.url);
  };
  addInput(videoFormat);
  if (audioFormat.url) addInput(audioFormat);
  return inputs;
};

function handleVideoStream(url, formatId, cookieArgs, preFetchedInfo) {
  const combinedStdout = new PassThrough(),
    eventBus = new (require("node:events"))();
  let ffmpegProcess = null;
  const proxy = {
    stdout: combinedStdout,
    kill: () => {
      if (ffmpegProcess?.exitCode === null) ffmpegProcess.kill("SIGKILL");
    },
    on: (event, cb) =>
      event === "close"
        ? eventBus.on("close", cb)
        : combinedStdout.on(event, cb),
    get exitCode() {
      return ffmpegProcess?.exitCode;
    },
  };

  (async () => {
    try {
      const info = preFetchedInfo || (await getVideoInfo(url, cookieArgs));
      const videoFormat = info.formats.find(
        (f) => f.format_id === formatId,
      ) || { url: null };
      if (!videoFormat.url) throw new Error("No video URL");

      const videoHasAudio = videoFormat.acodec && videoFormat.acodec !== "none";
      const audioFormat = videoHasAudio
        ? { url: null }
        : getBestAudioFormat(info.formats);

      if (
        ["tiktok.com", "reddit.com"].some((d) => url.includes(d)) &&
        videoHasAudio &&
        !audioFormat.url
      ) {
        return handleDoublePipeStream(
          url,
          formatId,
          cookieArgs,
          combinedStdout,
          eventBus,
          proxy,
        );
      }

      const ffmpegInputs = buildFfmpegInputs(
        videoFormat,
        audioFormat,
        info,
        cookieArgs,
      );
      const audioMap = audioFormat.url
        ? ["-map", "1:a:0"]
        : videoHasAudio
          ? ["-map", "0:a:0"]
          : ["-map", "0:a?"];
      const ffmpegArgs = [
        "-hide_banner",
        "-loglevel",
        "error",
        ...ffmpegInputs,
        "-c",
        "copy",
        "-bsf:a",
        "aac_adtstoasc",
        "-map",
        "0:v:0",
        ...audioMap,
        "-shortest",
        "-f",
        "mp4",
        "-movflags",
        "frag_keyframe+empty_moov+default_base_moof",
        "pipe:1",
      ];

      ffmpegProcess = spawn("ffmpeg", ffmpegArgs);
      ffmpegProcess.stdout.pipe(combinedStdout);
      ffmpegProcess.on("close", (code) => eventBus.emit("close", code));
    } catch (err) {
      combinedStdout.emit("error", err);
      eventBus.emit("close", 1);
    }
  })();
  return proxy;
}

function streamDownload(url, options, cookieArgs = [], preFetchedInfo = null) {
  const { format, formatId } = options;
  const baseArgs = [
    ...cookieArgs,
    "--user-agent",
    USER_AGENT,
    ...COMMON_ARGS,
    "--cache-dir",
    CACHE_DIR,
    "--newline",
    "--progress",
    "--progress-template",
    "[download] %(progress._percent_str)s",
    "--no-part",
  ];
  if (url.includes("youtube.com") || url.includes("youtu.be"))
    baseArgs.push(
      "--extractor-args",
      "youtube:player_client=web_safari,android_vr,tv",
    );
  baseArgs.push(url);

  if (format === "mp3")
    return handleMp3Stream(url, formatId, cookieArgs, preFetchedInfo);
  if (["m4a", "webm", "audio", "opus"].includes(format))
    return spawn("yt-dlp", [
      "-f",
      formatId || "bestaudio[ext=m4a]/bestaudio",
      "-o",
      "-",
      ...baseArgs,
    ]);
  return handleVideoStream(url, formatId, cookieArgs, preFetchedInfo);
}

function spawnDownload(url, options, cookieArgs = []) {
  const { format, formatId, tempFilePath } = options;
  const baseArgs = [
    ...cookieArgs,
    "--user-agent",
    USER_AGENT,
    ...COMMON_ARGS,
    "--cache-dir",
    CACHE_DIR,
    "--newline",
    "--progress",
    "-o",
    tempFilePath,
  ];
  if (url.includes("youtube.com") || url.includes("youtu.be"))
    baseArgs.push(
      "--extractor-args",
      "youtube:player_client=web_safari,android_vr,tv",
    );
  baseArgs.push(url);

  let args = [];
  if (["mp3", "m4a", "webm", "audio"].includes(format)) {
    const fId = formatId || "bestaudio[ext=m4a]/bestaudio";
    args =
      format !== "mp3"
        ? ["-f", fId, ...baseArgs]
        : ["-f", fId, "--extract-audio", "--audio-format", "mp3", ...baseArgs];
  } else {
    args = [
      "-f",
      formatId ? `${formatId}+bestaudio/best` : "bestvideo+bestaudio/best",
      "-S",
      "res,vcodec:vp9",
      "--merge-output-format",
      "mp4",
      ...baseArgs,
    ];
  }
  return spawn("yt-dlp", args);
}

module.exports = {
  streamDownload,
  spawnDownload,
};
