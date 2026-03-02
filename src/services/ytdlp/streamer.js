const { spawn } = require("node:child_process");
const fs = require("node:fs");
const { PassThrough } = require("node:stream");
const { COMMON_ARGS, CACHE_DIR, USER_AGENT } = require("./config");
const { getVideoInfo } = require("./info");

const getBestAudioFormat = (formats, preferOpus = false) => {
  return (
    formats
      .filter((f) => f.acodec !== "none" && (!f.vcodec || f.vcodec === "none"))
      .sort((a, b) => {
        if (preferOpus) {
          const aIsOpus = a.acodec?.includes("opus"),
            bIsOpus = b.acodec?.includes("opus");
          if (aIsOpus && !bIsOpus) return -1;
          if (!aIsOpus && bIsOpus) return 1;
        } else {
          const aIsAac = a.acodec?.includes("aac"),
            bIsAac = b.acodec?.includes("aac");
          if (aIsAac && !bIsAac) return -1;
          if (!aIsAac && bIsAac) return 1;
        }
        return (b.abr || 0) - (a.abr || 0);
      })[0] || { url: null }
  );
};

const buildFfmpegInputs = (videoFormat, audioFormat, info, cookieArgs) => {
  const referer = info?.http_headers?.["Referer"] || info?.webpage_url || "";
  const cookiesFile = cookieArgs.join(" ").includes("--cookies")
    ? cookieArgs[cookieArgs.indexOf("--cookies") + 1]
    : null;

  const inputs = [];

  const addInput = (format) => {
    if (!format.url) return;
    const cookieString = getNetscapeCookieString(cookiesFile, format.url);
    inputs.push(
      "-reconnect", "1",
      "-reconnect_streamed", "1",
      "-reconnect_delay_max", "5",
      "-user_agent", USER_AGENT,
      ...(referer ? ["-referer", referer] : []),
      ...(cookieString ? ["-cookies", cookieString] : []),
      "-i", format.url
    );
  };

  addInput(videoFormat);
  if (audioFormat.url) addInput(audioFormat);

  return inputs;
};

const getNetscapeCookieString = (cookiesFile, url) => {
  if (!cookiesFile || !fs.existsSync(cookiesFile)) return null;
  try {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    return fs
      .readFileSync(cookiesFile, "utf8")
      .split("\n")
      .filter((line) => !line.startsWith("#") && line.trim())
      .map((line) => line.split("\t"))
      .filter((parts) => parts.length >= 7 && parts[0].includes(domain))
      .map((parts) => `${parts[5]}=${parts[6]}`)
      .join("; ");
  } catch (e) {
    return null;
  }
};

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
      let audioFormat = info?.formats?.find(f => f.format_id === formatId && f.url);
      if (!audioFormat) {
          info = info || (await getVideoInfo(url, cookieArgs));
          audioFormat = info.formats.find(f => f.format_id === formatId) || info.formats.filter(f => f.acodec !== "none").sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
      }
      if (!audioFormat?.url) throw new Error("No audio URL");

      const referer = info?.http_headers?.["Referer"] || info?.webpage_url || "";
      const cookiesFile = cookieArgs.join(" ").includes("--cookies")
        ? cookieArgs[cookieArgs.indexOf("--cookies") + 1]
        : null;
      const cookieString = getNetscapeCookieString(cookiesFile, audioFormat.url);

      ffmpegProcess = spawn("ffmpeg", [
        "-hide_banner",
        "-loglevel", "error",
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
        "-user_agent", USER_AGENT,
        ...(referer ? ["-referer", referer] : []),
        ...(cookieString ? ["-cookies", cookieString] : []),
        "-i", audioFormat.url,
        "-c:a", "libmp3lame",
        "-b:a", "192k",
        "-f", "mp3",
        "pipe:1"
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

function handleVideoStream(url, formatId, cookieArgs, preFetchedInfo, requestedFormat = "mp4") {
  const combinedStdout = new PassThrough(),
    eventBus = new (require("node:events"))();
  
  let ffmpegProcess = null;
  let videoPipe = null;
  let audioPipe = null;

  const proxy = {
    stdout: combinedStdout,
    kill: () => {
      if (ffmpegProcess?.exitCode === null) ffmpegProcess.kill("SIGKILL");
      if (videoPipe?.exitCode === null) videoPipe.kill("SIGKILL");
      if (audioPipe?.exitCode === null) audioPipe.kill("SIGKILL");
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
      
      let videoFormat = info.formats.find((f) => String(f.format_id) === String(formatId));
      
      if (!videoFormat || !videoFormat.url) {
          videoFormat = info.formats
            .filter(f => f.vcodec !== "none" && f.url && !f.url.includes('.m3u8'))
            .sort((a, b) => (b.height || 0) - (a.height || 0))[0] || { url: null };
      }

      if (!videoFormat.url) throw new Error("No direct video URL available for streaming");

      const vcodec = videoFormat.vcodec || "";
      const isAvc = vcodec.startsWith("avc1") || vcodec.startsWith("h264");
      const outFormat = requestedFormat === "mp4" ? "mp4" : (isAvc ? "mp4" : "webm");

      const videoHasAudio = videoFormat.acodec && videoFormat.acodec !== "none";
      const audioFormat = videoHasAudio ? { url: null } : getBestAudioFormat(info.formats, outFormat === "webm");

      const baseArgs = ["--user-agent", USER_AGENT, ...cookieArgs, ...COMMON_ARGS, "-o", "-", url];

      const cleanVideoId = videoFormat.format_id.split('-')[0];
      videoPipe = spawn("yt-dlp", ["-f", cleanVideoId, ...baseArgs]);
      
      const ffmpegArgs = [
        "-hide_banner",
        "-loglevel", "error",
        "-i", "pipe:3"
      ];

      if (audioFormat.url) {
          const cleanAudioId = audioFormat.format_id.split('-')[0];
          audioPipe = spawn("yt-dlp", ["-f", cleanAudioId, ...baseArgs]);
          ffmpegArgs.push("-i", "pipe:4");
      }

      ffmpegArgs.push("-c", "copy");
      ffmpegArgs.push("-map", "0:v:0");

      if (audioFormat.url) {
          ffmpegArgs.push("-map", "1:a:0");
      } else if (videoHasAudio) {
          ffmpegArgs.push("-map", "0:a:0");
      } else {
          ffmpegArgs.push("-map", "0:a?");
      }

      ffmpegArgs.push("-shortest");

      const isAacAudio = audioFormat.acodec && audioFormat.acodec.includes("aac");

      if (outFormat === "mp4") {
        if (isAacAudio) {
            ffmpegArgs.push("-bsf:a", "aac_adtstoasc");
        }
        ffmpegArgs.push(
            "-f", "mp4",
            "-movflags", "frag_keyframe+empty_moov+default_base_moof"
        );
      } else {
        ffmpegArgs.push("-f", "webm");
      }
      
      ffmpegArgs.push("pipe:1");

      ffmpegProcess = spawn("ffmpeg", ffmpegArgs, {
          stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe']
      });

      ffmpegProcess.stderr.on('data', d => {
          console.error('[FFMPEG STDERR]', d.toString());
      });

      videoPipe.stdout.on('error', () => {});
      videoPipe.stderr.on('data', () => {}); // Consume stderr to prevent buffer block

      if (audioPipe) {
          audioPipe.stdout.on('error', () => {});
          audioPipe.stderr.on('data', () => {}); // Consume stderr to prevent buffer block
      }
      
      ffmpegProcess.stdio[3].on('error', () => {});
      if (ffmpegProcess.stdio[4]) ffmpegProcess.stdio[4].on('error', () => {});

      videoPipe.stdout.pipe(ffmpegProcess.stdio[3]);
      if (audioPipe) audioPipe.stdout.pipe(ffmpegProcess.stdio[4]);
      
      ffmpegProcess.stdout.pipe(combinedStdout);

      ffmpegProcess.on("close", (code) => {
          if (videoPipe?.exitCode === null) videoPipe.kill();
          if (audioPipe?.exitCode === null) audioPipe.kill();
          eventBus.emit("close", code);
      });

    } catch (err) {
      console.error("[Streamer] Server Mux Error:", err.message);
      combinedStdout.emit("error", err);
      eventBus.emit("close", 1);
    }
  })();
  return proxy;
}

function streamDownload(url, options, cookieArgs = [], preFetchedInfo = null) {
  const { format, formatId } = options;
  
  const fastUrl = !url.includes('ratebypass=yes') ? `${url}${url.includes('?') ? '&' : '?'}ratebypass=yes` : url;

  const isAudioFormat = ["m4a", "audio", "opus", "mp3"].includes(format) || 
                        (format === "webm" && (String(formatId) === "251" || String(formatId).includes("audio")));

  if (isAudioFormat) {
    if (format === "mp3") return handleMp3Stream(fastUrl, formatId, cookieArgs, preFetchedInfo);
    
    const baseArgs = [
        ...cookieArgs, "--user-agent", USER_AGENT, ...COMMON_ARGS, "--cache-dir", CACHE_DIR,
        "--newline", "--no-part"
    ];
    if (url.includes("youtube.com") || url.includes("youtu.be"))
        baseArgs.push("--extractor-args", "youtube:player_client=web_safari,android_vr,tv");
    
    return spawn("yt-dlp", ["-f", formatId || "bestaudio[ext=m4a]/bestaudio", "-o", "-", ...baseArgs, fastUrl]);
  }
  
  return handleVideoStream(fastUrl, formatId, cookieArgs, preFetchedInfo, format);
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

  let args = [];
  if (["mp3", "m4a", "webm", "audio"].includes(format)) {
    const fId = formatId || "bestaudio/best";
    args =
      format !== "mp3"
        ? ["-f", fId, ...baseArgs, url]
        : ["-f", fId, "--extract-audio", "--audio-format", "mp3", ...baseArgs, url];
  } else {
    args = [
      "-f",
      formatId ? `${formatId}+bestaudio/best` : "bestvideo+bestaudio/best",
      "-S",
      "res,vcodec:vp9",
      "--merge-output-format",
      "mp4",
      ...baseArgs,
      url
    ];
  }
  return spawn("yt-dlp", args);
}

module.exports = {
  streamDownload,
  spawnDownload,
};
