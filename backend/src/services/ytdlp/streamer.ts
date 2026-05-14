import { spawn, ChildProcess } from "node:child_process";
import { PassThrough } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { COMMON_ARGS, USER_AGENT, CACHE_DIR } from "./config.js";
import { getVideoInfo } from "./info.js";
import { VideoInfo, Format } from "../../types/index.js";

export interface StreamOptions {
  format: string;
  formatId: string;
  tempFilePath?: string;
  _retried?: boolean;
}

export interface StreamerProcess extends PassThrough {
  kill?: (signal?: string) => void;
}

async function handleTurboMux(
  url: string,
  info: VideoInfo,
  options: StreamOptions,
  extractor: any,
  selectedFormat: Format,
  combinedStdout: StreamerProcess
) {
  const { formatId, format } = options;
  console.log(`[Streamer] Turbo-Muxing enabled for: ${selectedFormat.format_id}`);
  const { getQuantumStream } = await import('../../utils/proxy.util.js');
  
  const videoStream = await extractor.getStream(info, { formatId, format });
  const audioUrl = selectedFormat.audio_url || '';
  if (!audioUrl) {
    throw new Error('Turbo-mux requires audio_url');
  }

  const getReferer = (targetUrl: string) => {
    if (targetUrl.includes('facebook.com')) return 'https://www.facebook.com/';
    if (targetUrl.includes('instagram.com')) return 'https://www.instagram.com/';
    try {
      return new URL(targetUrl).origin + '/';
    } catch {
      return undefined;
    }
  };

  const audioStream = await getQuantumStream(audioUrl, { 
      'User-Agent': USER_AGENT, 
      'Referer': getReferer(url) || ''
  });

  const isNativeAAC = selectedFormat?.acodec?.startsWith('mp4a') || selectedFormat?.acodec?.includes('aac');
  const audioCodecArg = isNativeAAC ? 'copy' : 'aac';

  const controller = new AbortController();
  const ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',
    '-i', 'pipe:3',
    '-c:v', 'copy',
    '-c:a', audioCodecArg,
    '-b:a', '128k',
    '-map', '0:v?',
    '-map', '1:a?',
    '-shortest',
    '-f', 'mp4',
    '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
    '-frag_duration', '1000000',
    'pipe:1'
  ], {
    stdio: ['pipe', 'pipe', 'pipe', 'pipe'], // stdin, stdout, stderr, pipe:3
    signal: controller.signal
  });

  const handleError = (err: NodeJS.ErrnoException, type: string) => {
    console.error(`[Streamer] Turbo-Mux ${type} Error:`, err.message);
    combinedStdout.emit("error", err);
  };

  videoStream.on('error', (err: any) => handleError(err, 'Video'));
  audioStream.on('error', (err: any) => handleError(err, 'Audio'));

  videoStream.pipe(ffmpeg.stdin);
  const pipe3 = ffmpeg.stdio[3] as import('stream').Writable;
  if (pipe3) {
    audioStream.pipe(pipe3);
  } else {
    audioStream.destroy();
    throw new Error('ffmpeg pipe:3 unavailable');
  }

  ffmpeg.stdout.pipe(combinedStdout);
  ffmpeg.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'ABORT_ERR') {
      console.error('[Streamer] Turbo-Mux Error:', err);
      combinedStdout.emit("error", err);
    }
  });

  combinedStdout.kill = () => {
    videoStream.destroy?.();
    audioStream.destroy?.();
    controller.abort();
  };
  
  videoStream.on('end', () => combinedStdout.emit("progress", 80));
  audioStream.on('end', () => combinedStdout.emit("progress", 100));
}

async function handlePureJSStream(
  url: string,
  info: VideoInfo,
  options: StreamOptions,
  extractor: any,
  selectedFormat: Format,
  combinedStdout: StreamerProcess,
  platform: string
) {
  const { formatId, format } = options;
  console.log(`[Download] Engine: Pure-JS | Platform: ${platform} | URL: ${url}`);
  
  const hasAudioUrl = selectedFormat?.audio_url;
  const hasAudio = Boolean(hasAudioUrl || selectedFormat?.is_audio || (selectedFormat?.acodec && selectedFormat.acodec !== 'none'));
  console.log(`[Streamer] Selected Format: ${selectedFormat?.format_id} | Resolution: ${selectedFormat?.resolution} | Has Audio: ${hasAudio}`);

  if (hasAudioUrl && format !== 'mp3') {
    return handleTurboMux(url, info, options, extractor, selectedFormat, combinedStdout);
  }

  const rawStream = await extractor.getStream(info, { formatId, format });
  combinedStdout.emit("progress", 50);

  if (format === 'mp3') {
    const controller = new AbortController();
    const ffmpeg = spawn('ffmpeg', [
      '-i', 'pipe:0',
      '-vn',
      '-ab', '192k',
      '-f', 'mp3',
      'pipe:1'
    ], { signal: controller.signal });
    rawStream.pipe(ffmpeg.stdin);
    ffmpeg.stdout.pipe(combinedStdout);

    ffmpeg.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'ABORT_ERR') {
        console.error('[Streamer] FFmpeg Transcode Error:', err);
        combinedStdout.emit("error", err);
      }
    });

    combinedStdout.kill = () => {
      if (typeof rawStream.destroy === "function") rawStream.destroy();
      controller.abort();
    };
  } else {
    rawStream.pipe(combinedStdout);
    combinedStdout.kill = () => {
      if (typeof rawStream.destroy === "function") rawStream.destroy();
    };
  }

  rawStream.on('end', () => {
    combinedStdout.emit("progress", 100);
  });
}

function buildYtdlpArgs(
  options: StreamOptions,
  selectedFormat: Format,
  cookieArgs: string[]
): string[] {
  const { format, formatId } = options;
  const isYtAudioOnly = ['mp3', 'm4a', 'audio'].includes(format || '');
  const isWebm = format === 'webm';
  const isMp3 = format === 'mp3';
  const isM4a = format === 'm4a';

  const effectiveAudioOnly = isYtAudioOnly || (format === 'mp4' && String(formatId).includes('audio'));
  let fString = effectiveAudioOnly ? 'ba/ba*/b/best' : 'bv*+ba/b';

  if (!isMp3 && !isM4a && formatId && formatId !== 'best') {
      const cleanFid = String(formatId).split('-')[0];
      fString = `${cleanFid}+bestaudio/best`;
  }

  const args = [
    ...cookieArgs,
    "--user-agent", USER_AGENT,
    ...COMMON_ARGS,
    "--no-playlist",
    "--flat-playlist",
    "--no-check-formats",
    "--no-check-certificate",
    "--extractor-args", "youtube:player-client=web,android,mweb",
    "-f", fString,
    "--newline",
    "--progress",
    "-o", "-",
  ];

  if (!isYtAudioOnly) {
      args.push("--merge-output-format", isWebm ? 'webm' : 'mp4');
  }

  const isNativeH264 = selectedFormat?.vcodec?.startsWith('avc1') || selectedFormat?.vcodec?.startsWith('h264');
  const isNativeAAC = selectedFormat?.acodec?.startsWith('mp4a') || selectedFormat?.acodec?.includes('aac');
  const shouldCopy = isNativeH264 && (isNativeAAC || !selectedFormat?.acodec || selectedFormat.acodec === 'none');

  if (isWebm) {
    args.push("--downloader", "ffmpeg", "--downloader-args", "ffmpeg:-f matroska -live 1 -flush_packets 1");
  } else if (!isYtAudioOnly) {
    if (shouldCopy) {
       args.push("--downloader", "ffmpeg", "--downloader-args", "ffmpeg:-c:v copy -c:a copy -bsf:a aac_adtstoasc -f mp4 -movflags frag_keyframe+empty_moov+default_base_moof -frag_duration 1000000 -ignore_unknown");
    } else {
       const height = selectedFormat?.height || 0;
       const preset = height >= 1080 ? 'superfast' : 'ultrafast';
       const maxVideoBitrate = height >= 2160 ? '50000k' : height >= 1080 ? '12000k' : '3000k';
       const bufSize = height >= 2160 ? '100000k' : height >= 1080 ? '24000k' : '6000k';
       const crf = height >= 2160 ? '20' : height >= 1080 ? '22' : '24';
       args.push("--downloader", "ffmpeg", "--downloader-args", `ffmpeg:-c:v libx264 -preset ${preset} -threads 0 -crf ${crf} -maxrate ${maxVideoBitrate} -bufsize ${bufSize} -c:a aac -b:a 128k -bsf:a aac_adtstoasc -f mp4 -movflags frag_keyframe+empty_moov+default_base_moof -frag_duration 1000000 -ignore_unknown`);
    }
  }
  return args;
}

export function streamDownload(url: string, options: StreamOptions, cookieArgs: string[] = [], preFetchedInfo: VideoInfo | null = null): StreamerProcess {
  const { format, formatId } = options;
  const combinedStdout: StreamerProcess = new PassThrough();
  let proc: ChildProcess | null = null;

  (async () => {
    try {
      const info: VideoInfo = preFetchedInfo || await getVideoInfo(url, cookieArgs) || {} as VideoInfo;
      const extractorKey = (info.extractor_key || '').toLowerCase();
      const isSpotify = url.includes('spotify.com') || info.is_spotify || extractorKey === 'spotify';
      
      const { getExtractor } = await import('../extractors/index.js');
      const extractorMap = await getExtractor(url);
      const extractor = (info.is_js_info && extractorKey) ? extractorMap : null;

      const formats = Array.isArray(info.formats) ? info.formats : [];
      const isAudioOnly = ['mp3', 'm4a', 'audio'].includes(format || '');
      const selectedFormat = formats.find((f: Format) => String(f.format_id) === String(formatId)) || formats[0];
      const height = selectedFormat?.height || 0;

      const isJSStream = extractor && typeof extractor.getStream === 'function' && 
                        (['facebook', 'instagram', 'soundcloud'].includes(extractorKey) || 
                        (extractorKey === 'youtube' && (isAudioOnly || (height <= 720 && selectedFormat?.is_muxed))));

      const platform = isSpotify ? 'Spotify' : extractorKey.charAt(0).toUpperCase() + extractorKey.slice(1);

      if (isJSStream) {
        try {
          await handlePureJSStream(url, info, options, extractor, selectedFormat, combinedStdout, platform);
          return;
        } catch (err: unknown) {
          const error = err as NodeJS.ErrnoException;
          console.warn("[Streamer] JS Direct-Pipe failed, falling back to yt-dlp:", error.message);
        }
      }

      const args = buildYtdlpArgs(options, selectedFormat, cookieArgs);
      console.log(`[Download] Engine: yt-dlp | Platform: ${platform} | URL: ${url}`);
      
      const fallbackUrl = info.target_url || url;
      const youtubeId = (info.target_url || info.webpage_url || '').match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1] || info.id;
      const cachedJsonPath = path.join(CACHE_DIR, 'metadata', `${youtubeId}.json`);
      const useCache = fs.existsSync(cachedJsonPath);

      const spawnYtdlp = (withCache = false) => {
          const currentArgs = [...args];
          if (withCache) {
              currentArgs.push("--load-info-json", cachedJsonPath);
          } else {
              currentArgs.push(fallbackUrl);
          }
          return spawn("yt-dlp", currentArgs);
      };

      const handleOutput = (p: ChildProcess, wasUsingCache: boolean) => {
          if (format === 'mp3') {
            const controller = new AbortController();
            const ffmpeg = spawn('ffmpeg', [
              '-i', 'pipe:0',
              '-vn',
              '-ab', '192k',
              '-f', 'mp3',
              'pipe:1'
            ], { signal: controller.signal });
            
            if (p.stdout) p.stdout.pipe(ffmpeg.stdin);
            ffmpeg.stdout.pipe(combinedStdout);
            
            ffmpeg.on('error', (err: NodeJS.ErrnoException) => {
              if (err.code !== 'ABORT_ERR') {
                console.error('[Streamer] FFmpeg Transcode Error:', err);
                combinedStdout.emit("error", err);
              }
            });

            const originalKill = combinedStdout.kill;
            combinedStdout.kill = () => {
              p.kill("SIGKILL");
              controller.abort();
              if (originalKill) originalKill();
            };
          } else {
            if (p.stdout) p.stdout.pipe(combinedStdout);
          }

          let capturedStderr = '';
          if (p.stderr) {
            p.stderr.on('data', d => {
                const msg = d.toString();
                capturedStderr += msg;
                const match = msg.match(/\[download\]\s+(\d+\.\d+)%/);
                if (match) combinedStdout.emit("progress", parseFloat(match[1]));
            });
          }

          p.on("close", (code) => {
              if (code !== 0) {
                console.error(`[Streamer] yt-dlp exited with code ${code}. Stderr: ${capturedStderr}`);
                if (wasUsingCache && (capturedStderr.includes('403') || capturedStderr.includes('Forbidden'))) {
                    console.log("[Streamer] 403 detected, retrying without cache...");
                    proc = spawnYtdlp(false);
                    if (proc) handleOutput(proc, false);
                    return;
                }
              }
              if (!combinedStdout.writableEnded) combinedStdout.end();
          });
      };

      proc = spawnYtdlp(useCache);
      handleOutput(proc, useCache);

    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      console.error('[Streamer] fatal:', error.message);
      combinedStdout.emit("error", error);
    }
  })();

  combinedStdout.kill = combinedStdout.kill || (() => { if (proc) proc.kill("SIGKILL"); });
  return combinedStdout;
}

export function spawnDownload(url: string, options: StreamOptions & { tempFilePath: string }, cookieArgs: string[] = []): ChildProcess {
  const { format, formatId, tempFilePath } = options;
  const baseArgs = [...cookieArgs, "--user-agent", USER_AGENT, ...COMMON_ARGS, "--cache-dir", CACHE_DIR, "--newline", "--progress", "-o", tempFilePath];
  let args: string[] = [];
  if (["mp3", "m4a", "webm", "audio"].includes(format)) {
    const fId = (formatId && formatId !== 'mp3' && formatId !== 'm4a') ? `${formatId}/ba/b` : "ba/b";
    args = format !== "mp3" ? ["-f", fId, ...baseArgs, url] : ["-f", fId, "--extract-audio", "--audio-format", "mp3", ...baseArgs, url];
  } else {
    args = ["-f", formatId ? `${formatId}+ba/ba/b` : "bv*[vcodec^=avc1]+ba/b", "-S", "res,vcodec:h264", "--merge-output-format", "mp4", ...baseArgs, url];
  }
  return spawn("yt-dlp", args);
}
