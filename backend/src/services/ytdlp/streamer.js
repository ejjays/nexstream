const { spawn } = require("node:child_process");
const { PassThrough } = require("node:stream");
const { COMMON_ARGS, USER_AGENT } = require("./config");
const { getVideoInfo } = require("./info");

// direct pipe
function streamDownload(url, options, cookieArgs = [], preFetchedInfo = null) {
  const { format, formatId } = options;
  const combinedStdout = new PassThrough();
  let proc = null;

  (async () => {
    try {
      const info = preFetchedInfo || await getVideoInfo(url, cookieArgs);
      const cleanFid = String(formatId || 'best').split('-')[0];
      const isAudioOnly = ['mp3', 'm4a', 'audio'].includes(format || '');
      const isWebm = format === 'webm';
      const isMp3 = format === 'mp3';
      const isM4a = format === 'm4a';

      let fString = isAudioOnly ? 'bestaudio/best' : `${cleanFid}+bestaudio/best`;
      
      const args = [
        ...cookieArgs,
        "--user-agent", USER_AGENT,
        ...COMMON_ARGS,
        "-f", fString,
        "--newline",
        "--progress",
        "-o", "-",
        url
      ];

      if (isMp3 || isM4a) {
        args.push("--extract-audio", "--audio-format", isMp3 ? "mp3" : "m4a");
      } else if (isWebm) {
        args.push("--downloader", "ffmpeg", "--downloader-args", "ffmpeg:-f matroska -live 1 -flush_packets 1");
      } else {
        // mp4 muxing
        args.push("--downloader", "ffmpeg", "--downloader-args", "ffmpeg:-movflags +frag_keyframe+empty_moov+default_base_moof -f mp4 -ignore_unknown");
      }

      console.log(`[Streamer] [${format}] Spawning direct-pipe: ${url} (Format: ${fString})`);
      proc = spawn("yt-dlp", args);
      
      // pipe stdout
      proc.stdout.pipe(combinedStdout);

      proc.stderr.on('data', d => {
          const msg = d.toString();
          
          if (msg.includes('ERROR')) {
              console.error(`[yt-dlp-error] ${msg.trim()}`);
          } else if (msg.includes('WARNING')) {
              console.warn(`[yt-dlp-warning] ${msg.trim()}`);
          }
          
          // debug ffmpeg logs
          if (msg.includes('ffmpeg') || msg.includes('size=')) {
              // log significant only
              if (msg.includes('error')) console.error(`[ffmpeg-err] ${msg.trim()}`);
          }

          const match = msg.match(/\[download\]\s+(\d+\.\d+)%/);
          if (match) {
              combinedStdout.emit("progress", parseFloat(match[1]));
          }
      });

      proc.on("close", (code) => {
          console.log(`[Streamer] yt-dlp process closed (Code ${code})`);
          setTimeout(() => {
              if (!combinedStdout.writableEnded) combinedStdout.end();
          }, 1000);
      });

      proc.on("error", (err) => {
          console.error('[Streamer] Process error:', err);
          combinedStdout.emit("error", err);
      });

    } catch (err) {
      console.error('[Streamer] fatal:', err.message);
      combinedStdout.emit("error", err);
      if (!combinedStdout.writableEnded) combinedStdout.end();
    }
  })();

  combinedStdout.kill = () => { if (proc) proc.kill("SIGKILL"); };
  return combinedStdout;
}

function spawnDownload(url, options, cookieArgs = []) {
  const { format, formatId, tempFilePath } = options;
  const { USER_AGENT } = require("./config");
  const baseArgs = [...cookieArgs, "--user-agent", USER_AGENT, ...COMMON_ARGS, "--cache-dir", CACHE_DIR, "--newline", "--progress", "-o", tempFilePath];
  let args = [];
  if (["mp3", "m4a", "webm", "audio"].includes(format)) {
    const fId = formatId || "bestaudio/best";
    args = format !== "mp3" ? ["-f", fId, ...baseArgs, url] : ["-f", fId, "--extract-audio", "--audio-format", "mp3", ...baseArgs, url];
  } else {
    args = ["-f", formatId ? `${formatId}+bestaudio/best` : "bestvideo+bestaudio/best", "-S", "res,vcodec:vp9", "--merge-output-format", "mp4", ...baseArgs, url];
  }
  return spawn("yt-dlp", args);
}

module.exports = { streamDownload, spawnDownload };
