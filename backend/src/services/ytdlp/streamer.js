const { spawn } = require("node:child_process");
const { PassThrough } = require("node:stream");
const { COMMON_ARGS, USER_AGENT } = require("./config");
const { getVideoInfo } = require("./info");

// stream download service
function streamDownload(url, options, cookieArgs = [], preFetchedInfo = null) {
  const { format, formatId } = options;
  const combinedStdout = new PassThrough();
  let proc = null;

  (async () => {
    try {
      const info = preFetchedInfo || await getVideoInfo(url, cookieArgs);
      
      const extractorKey = (info.extractor_key || '').toLowerCase();
      const extractor = (info.is_js_info && extractorKey) ? require('../extractors')[extractorKey] : null;

      // js social pipe
      const isSocialJS = extractor && typeof extractor.getStream === 'function' && 
                        (['facebook', 'instagram', 'tiktok'].includes(extractorKey));

      if (isSocialJS) {
        console.log(`[Streamer] [${format}] Spawning JS Direct-Pipe for Social: ${url} (Extractor: ${extractorKey})`);
        try {
          const rawStream = await extractor.getStream(info, { formatId, format });
          
          combinedStdout.emit("progress", 50);

          // transcode to mp3
          if (format === 'mp3') {
            console.log(`[Streamer] Transcoding JS stream to MP3...`);
            const ffmpeg = spawn('ffmpeg', [
              '-i', 'pipe:0',
              '-vn',
              '-ab', '192k',
              '-f', 'mp3',
              'pipe:1'
            ]);

            rawStream.pipe(ffmpeg.stdin);
            ffmpeg.stdout.pipe(combinedStdout);

            ffmpeg.on('error', (err) => {
              console.error('[Streamer] FFmpeg Transcode Error:', err);
              combinedStdout.emit("error", err);
            });

            combinedStdout.kill = () => {
              if (rawStream.destroy) rawStream.destroy();
              ffmpeg.kill('SIGKILL');
            };
          } else {
            // direct pipe stream
            rawStream.pipe(combinedStdout);
            combinedStdout.kill = () => { if (rawStream.destroy) rawStream.destroy(); };
          }

          rawStream.on('end', () => {
              console.log(`[Streamer] JS stream ended`);
              combinedStdout.emit("progress", 100);
          });
          
          return;
        } catch (e) {
          console.warn(`[Streamer] JS Direct-Pipe failed, falling back to yt-dlp:`, e.message);
        }
      }

      // ytdlp fallback path
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
      ];

      const fallbackUrl = info.target_url || url;
      
      // use instant json
      const fs = require('fs');
      const path = require('path');
      const { CACHE_DIR } = require('./config');
      
      const youtubeId = (info.target_url || info.webpage_url || '').match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1] || info.id;
      const cachedJsonPath = path.join(CACHE_DIR, 'metadata', `${youtubeId}.json`);
      
      if (fs.existsSync(cachedJsonPath)) {
          console.log(`[Streamer] [${format}] Spawning Instant-JSON Path: ${cachedJsonPath}`);
          args.push("--load-info-json", cachedJsonPath);
      } else {
          console.log(`[Streamer] [${format}] Spawning Live-Scrape Path (No cache found): ${fallbackUrl}`);
          args.push(fallbackUrl);
      }

      if (isMp3 || isM4a) {
        args.push("--extract-audio", "--audio-format", isMp3 ? "mp3" : "m4a");
      } else if (isWebm) {
        args.push("--downloader", "ffmpeg", "--downloader-args", "ffmpeg:-f matroska -live 1 -flush_packets 1");
      } else {
        args.push("--downloader", "ffmpeg", "--downloader-args", "ffmpeg:-movflags +frag_keyframe+empty_moov+default_base_moof -f mp4 -ignore_unknown");
      }

      console.log(`[Streamer] Heavy-Lift Engine (yt-dlp) initiated.`);
      proc = spawn("yt-dlp", args);
      
      proc.stdout.pipe(combinedStdout);

      proc.stderr.on('data', d => {
          const msg = d.toString();
          const match = msg.match(/\[download\]\s+(\d+\.\d+)%/);
          if (match) combinedStdout.emit("progress", parseFloat(match[1]));
      });

      proc.on("close", (code) => {
          console.log(`[Streamer] yt-dlp closed (Code ${code})`);
          if (!combinedStdout.writableEnded) combinedStdout.end();
      });

    } catch (err) {
      console.error('[Streamer] fatal:', err.message);
      combinedStdout.emit("error", err);
    }
  })();

  combinedStdout.kill = combinedStdout.kill || (() => { if (proc) proc.kill("SIGKILL"); });
  return combinedStdout;
}

function spawnDownload(url, options, cookieArgs = []) {
  const { format, formatId, tempFilePath } = options;
  const { USER_AGENT, CACHE_DIR } = require("./config");
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
