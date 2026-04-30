import { spawn, ChildProcess } from "node:child_process";
import { PassThrough } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { COMMON_ARGS, USER_AGENT, CACHE_DIR } from "./config.js";
import { getVideoInfo } from "./info.js";
import { VideoInfo } from "../../types/index.js";

export interface StreamOptions {
  format: string;
  formatId: string;
  tempFilePath?: string;
  _retried?: boolean;
}

export function streamDownload(url: string, options: StreamOptions, cookieArgs: string[] = [], preFetchedInfo: VideoInfo | null = null): any {
  const { format, formatId } = options;
  const combinedStdout: any = new PassThrough();
  let proc: ChildProcess | null = null;

  (async () => {
    try {
      const info = preFetchedInfo || await getVideoInfo(url, cookieArgs);
      
      const extractorKey = (info.extractor_key || '').toLowerCase();
      const isSpotify = url.includes('spotify.com') || info.is_spotify || extractorKey === 'spotify';
      
      const { getExtractor } = await import('../extractors/index.js');
      const extractorMap = await getExtractor(url);
      const extractor = (info.is_js_info && extractorKey) ? (extractorMap as any) : null;

      const isJSStream = extractor && typeof extractor.getStream === 'function' && 
                        (['facebook', 'instagram', 'tiktok', 'soundcloud'].includes(extractorKey));

      if (isJSStream) {
        try {
          const rawStream = await extractor.getStream(info, { formatId, format });
          combinedStdout.emit("progress", 50);

          if (format === 'mp3') {
            const ffmpeg = spawn('ffmpeg', [
              '-i', 'pipe:0',
              '-vn',
              '-ab', '192k',
              '-f', 'mp3',
              'pipe:1'
            ]);

            rawStream.pipe(ffmpeg.stdin);
            ffmpeg.stdout.pipe(combinedStdout);

            ffmpeg.on('error', (err: any) => {
              console.error('[Streamer] FFmpeg Transcode Error:', err);
              combinedStdout.emit("error", err);
            });

            combinedStdout.kill = () => {
              if ((rawStream as any).destroy) (rawStream as any).destroy();
              ffmpeg.kill('SIGKILL');
            };
          } else {
            rawStream.pipe(combinedStdout);
            combinedStdout.kill = () => { if ((rawStream as any).destroy) (rawStream as any).destroy(); };
          }

          rawStream.on('end', () => {
              combinedStdout.emit("progress", 100);
          });
          
          return;
        } catch (e: any) {
          console.warn(`[Streamer] JS Direct-Pipe failed, falling back to yt-dlp:`, e.message);
        }
      }

      const isAudioOnly = ['mp3', 'm4a', 'audio'].includes(format || '');
      const isWebm = format === 'webm';
      const isMp3 = format === 'mp3';
      const isM4a = format === 'm4a';

      let fString = isAudioOnly ? 'ba/ba*/b/best' : 'bv*+ba/b';
      
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

      if (!isAudioOnly) {
          args.push("--merge-output-format", format === 'webm' ? 'webm' : 'mp4');
      }

      if (isWebm) {
        args.push("--downloader", "ffmpeg", "--downloader-args", "ffmpeg:-f matroska -live 1 -flush_packets 1");
      } else if (!isAudioOnly) {
        args.push("--downloader", "ffmpeg", "--downloader-args", "ffmpeg:-movflags +frag_keyframe+empty_moov+default_base_moof -f mp4 -ignore_unknown -c:a aac");
      }

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
          if (isMp3) {
            const ffmpeg = spawn('ffmpeg', [
              '-i', 'pipe:0',
              '-vn',
              '-ab', '192k',
              '-f', 'mp3',
              'pipe:1'
            ]);
            
            p.stdout!.pipe(ffmpeg.stdin);
            ffmpeg.stdout.pipe(combinedStdout);
            
            ffmpeg.on('error', (err: any) => {
              console.error('[Streamer] FFmpeg Transcode Error:', err);
              combinedStdout.emit("error", err);
            });

            const originalKill = combinedStdout.kill;
            combinedStdout.kill = () => {
              if (p) p.kill("SIGKILL");
              if (ffmpeg) ffmpeg.kill("SIGKILL");
              if (originalKill) originalKill();
            };
          } else {
            p.stdout!.pipe(combinedStdout);
          }

          let capturedStderr = '';
          p.stderr!.on('data', d => {
              const msg = d.toString();
              capturedStderr += msg;
              const match = msg.match(/\[download\]\s+(\d+\.\d+)%/);
              if (match) {
                combinedStdout.emit("progress", parseFloat(match[1]));
              }
          });

          p.on("close", (code) => {
              if (code !== 0) {
                if (wasUsingCache && (capturedStderr.includes('403') || capturedStderr.includes('Forbidden'))) {
                    proc = spawnYtdlp(false);
                    handleOutput(proc!, false);
                    return;
                }
              }
              if (!combinedStdout.writableEnded) combinedStdout.end();
          });
      };

      proc = spawnYtdlp(useCache);
      handleOutput(proc, useCache);

    } catch (err: any) {
      console.error('[Streamer] fatal:', err.message);
      combinedStdout.emit("error", err);
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
    args = ["-f", formatId ? `${formatId}+ba/ba/b` : "bv*+ba/b", "-S", "res,vcodec:vp9", "--merge-output-format", "mp4", ...baseArgs, url];
  }
  return spawn("yt-dlp", args);
}
