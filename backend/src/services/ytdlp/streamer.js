const { spawn } = require("node:child_process");
const { PassThrough } = require("node:stream");
const { COMMON_ARGS, CACHE_DIR, USER_AGENT } = require("./config");
const { getVideoInfo } = require("./info");
const extractors = require("../extractors");

function streamDownload(url, options, cookieArgs = [], preFetchedInfo = null) {
  const { format, formatId } = options;
  const combinedStdout = new PassThrough();
  const eventBus = new (require("node:events"))();
  let proc = null;

  const proxy = {
    stdout: combinedStdout,
    kill: () => { if (proc) proc.kill("SIGKILL"); },
    on: (event, cb) => event === "close" ? eventBus.on("close", cb) : combinedStdout.on(event, cb),
    get exitCode() { return proc?.exitCode; }
  };

  (async () => {
    try {
      const info = preFetchedInfo || await getVideoInfo(url, cookieArgs);
      const cleanFid = String(formatId || '').split('-')[0];
      
      // js path for 360p/audio
      if (cleanFid === '18' || (['mp3', 'm4a', 'audio'].includes(format) && !cleanFid.includes('136'))) {
        try {
          const stream = await extractors.youtube.getStream(info, {
            formatId: cleanFid,
            type: ['mp3', 'm4a', 'audio'].includes(format) ? 'audio' : 'video+audio'
          });
          for await (const chunk of stream) {
            combinedStdout.write(chunk);
          }
          combinedStdout.end();
          eventBus.emit("close", 0);
          return;
        } catch (e) {
          console.warn(`[JS-YT] fallback to ytdlp`);
        }
      }

      // reliable resolution-based ytdlp path
      const requestedFormat = info.formats?.find(f => String(f.format_id) === cleanFid);
      const res = requestedFormat?.resolution || '720p';
      const height = parseInt(res) || 720;
      const isWebm = format === "webm";

      console.log(`[YTDLP] streaming ${height}p (${format})...`);

      // force compatible codecs to avoid black screens
      let fString = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
      
      if (isWebm) {
        // prefer vp9 for high-res webm (better support than av1)
        fString = `bestvideo[height<=${height}][vcodec^=vp9]+bestaudio/best[height<=${height}][vcodec^=vp9]/best`;
      } else if (format === 'mp4' && height <= 1080) {
        // force avc for 1080p mp4
        fString = `bestvideo[height<=${height}][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=${height}][vcodec^=avc]/best`;
      }

      const args = [
        ...cookieArgs,
        "--user-agent", USER_AGENT,
        ...COMMON_ARGS,
        "-f", fString,
        "--merge-output-format", isWebm ? "mkv" : "mp4",
        "--downloader", "ffmpeg",
        "--downloader-args", isWebm 
          ? `ffmpeg:-f matroska -live 1` 
          : `ffmpeg:-movflags +frag_keyframe+empty_moov+default_base_moof -f mp4`,
        "-o", "-",
        url
      ];

      proc = spawn("yt-dlp", args);
      proc.stdout.pipe(combinedStdout);
      
      proc.stderr.on('data', d => {
          const msg = d.toString();
          if (msg.includes('ERROR')) console.error('[YTDLP-ERR]', msg.trim());
          else if (msg.includes('WARNING')) console.warn('[YTDLP-WARN]', msg.trim());
      });

      proc.on("close", (code) => eventBus.emit("close", code));

    } catch (err) {
      console.error('[Streamer] fatal:', err.message);
      combinedStdout.emit("error", err);
      eventBus.emit("close", 1);
    }
  })();

  return proxy;
}

function spawnDownload(url, options, cookieArgs = []) {
  const { format, formatId, tempFilePath } = options;
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
