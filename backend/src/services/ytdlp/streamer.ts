import { spawn, ChildProcess } from 'node:child_process';
import * as Sentry from '@sentry/node'; // skipcq: JS-C1003
import { PassThrough, Readable } from 'node:stream';
import { COMMON_ARGS, USER_AGENT, CACHE_DIR } from './config.js';
import { getVideoInfo } from './info.js';
import { VideoInfo, Format, SpotifyMetadata } from '../../types/index.js';
import path from 'node:path';
import { getTraceId } from '../../utils/infra/trace.util.js';

export interface StreamOptions {
  format: string;
  formatId: string;
  tempFilePath?: string;
  _retried?: boolean;
}

export interface StreamerProcess extends PassThrough {
  kill?: (signal?: string) => void;
}

interface Extractor {
  getStream: (
    info: VideoInfo,
    options?: Record<string, unknown>
  ) => Promise<Readable>;
}

function destroyStream(stream: unknown) {
  if (
    stream &&
    typeof (stream as { destroy?: () => void }).destroy === 'function'
  ) {
    (stream as { destroy: () => void }).destroy();
  }
}

function gracefulKill(childProcess: ChildProcess | null) {
  if (
    !childProcess ||
    !childProcess.pid ||
    childProcess.killed ||
    childProcess.exitCode !== null
  )
    return;

  const tid = getTraceId() || 'global';
  const pid = childProcess.pid;
  console.log(
    `[Streamer] [${tid}] Attempting graceful shutdown of PGID ${pid}...`
  );

  try {
    process.kill(-pid, 'SIGTERM');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
      childProcess.kill('SIGTERM');
  }

  const killTimeout = setTimeout(() => {
    if (
      childProcess &&
      !childProcess.killed &&
      childProcess.exitCode === null
    ) {
      console.warn(
        `[Streamer] [${tid}] PGID ${pid} still alive after SIGTERM, escalating to SIGKILL.`
      );
      try {
        process.kill(-pid, 'SIGKILL');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
          childProcess.kill('SIGKILL');
      }
    }
  }, 2000);

  childProcess.on('exit', () => clearTimeout(killTimeout));
}

async function handleTurboMux(
  url: string,
  info: VideoInfo,
  options: StreamOptions,
  extractor: Extractor,
  selectedFormat: Format,
  combinedStdout: StreamerProcess,
  extractorKey: string
) {
  const { formatId, format } = options;
  const tid = getTraceId() || 'global';
  console.log(
    `[Streamer] [${tid}] Turbo-Muxing enabled for: ${selectedFormat.formatId}`
  );

  const videoStream = await extractor.getStream(info, {
    formatId,
    format,
    type: 'video',
  });
  let audioStream;

  if (extractorKey === 'youtube') {
    audioStream = await extractor.getStream(info, {
      formatId: 'bestaudio',
      format: 'audio',
      type: 'audio',
    });
  } else {
    const { getQuantumStream } =
      await import('../../utils/network/proxy.util.js');
    const audioUrl = selectedFormat.audioUrl || '';
    if (!audioUrl) throw new Error('Turbo-mux requires audioUrl');

    const getReferer = (targetUrl: string) => {
      if (targetUrl.includes('facebook.com'))
        return 'https://www.facebook.com/';
      if (targetUrl.includes('instagram.com'))
        return 'https://www.instagram.com/';
      try {
        return `${new URL(targetUrl).origin}/`;
      } catch (error) {
        console.debug(
          '[Streamer] Referer resolution failed:',
          (error as Error).message
        );
        return '';
      }
    };

    audioStream = getQuantumStream(audioUrl, {
      'User-Agent': USER_AGENT,
      Referer: getReferer(url),
    });
  }

  const isNativeAAC =
    selectedFormat?.acodec?.startsWith('mp4a') ||
    selectedFormat?.acodec?.includes('aac');
  const audioCodecArg = isNativeAAC ? 'copy' : 'aac';

  const controller = new AbortController();
  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-i',
      'pipe:0',
      '-i',
      'pipe:3',
      '-c:v',
      'copy',
      '-c:a',
      audioCodecArg,
      '-b:a',
      '128k',
      '-map',
      '0:v?',
      '-map',
      '1:a?',
      '-shortest',
      '-f',
      'mp4',
      '-movflags',
      '+frag_keyframe+empty_moov+default_base_moof',
      '-frag_duration',
      '1000000',
      'pipe:1',
    ],
    {
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
      signal: controller.signal,
      detached: true,
    }
  );

  // drain stderr
  if (ffmpeg.stdio[2])
    (ffmpeg.stdio[2] as import('node:stream').Readable).resume();

  const handleError = (error: Error, type: string) => {
    console.error(`[Streamer] Turbo-Mux ${type} Error:`, error.message);
    combinedStdout.emit('error', error);
  };

  videoStream.on('error', (error) => handleError(error, 'Video'));
  audioStream.on('error', (error) => handleError(error, 'Audio'));

  combinedStdout.kill = () => {
    destroyStream(videoStream);
    destroyStream(audioStream);
    controller.abort();
    gracefulKill(ffmpeg);
  };

  const pipe3 = ffmpeg.stdio[3] as import('stream').Writable;
  if (!pipe3) {
    destroyStream(audioStream);
    throw new Error('ffmpeg pipe:3 unavailable');
  }

  const { pipeline } = await import('node:stream/promises');

  Promise.all([
    pipeline(videoStream, ffmpeg.stdio[0] as import('stream').Writable, {
      signal: controller.signal,
    }),
    pipeline(audioStream, pipe3, { signal: controller.signal }),
    pipeline(ffmpeg.stdio[1] as import('stream').Readable, combinedStdout, {
      signal: controller.signal,
    }),
  ])
    .catch((error) => {
      if (
        error.name !== 'AbortError' &&
        error.code !== 'ERR_STREAM_PREMATURE_CLOSE'
      ) {
        console.error('[Streamer] Pipeline failure:', error);
        Sentry.captureException(error);
        combinedStdout.emit('error', error);
      }
    })
    .finally(() => {
      if (combinedStdout.kill) combinedStdout.kill();
    });

  videoStream.on('end', () => combinedStdout.emit('progress', 80));
  audioStream.on('end', () => combinedStdout.emit('progress', 100));
}

async function handlePureJSStream(
  url: string,
  info: VideoInfo,
  options: StreamOptions,
  extractor: Extractor,
  selectedFormat: Format,
  combinedStdout: StreamerProcess,
  platform: string,
  extractorKey: string
) {
  const { formatId, format } = options;
  const tid = getTraceId() || 'global';
  console.log(
    `[Download] [${tid}] Engine: Pure-JS | Platform: ${platform} | URL: ${url}`
  );

  const hasAudioUrl = selectedFormat?.audioUrl;
  const hasAudio = Boolean(
    hasAudioUrl ||
    selectedFormat?.isAudio ||
    (selectedFormat?.acodec && selectedFormat.acodec !== 'none')
  );
  console.log(
    `[Streamer] Selected Format: ${selectedFormat?.formatId} | Resolution: ${selectedFormat?.resolution} | Has Audio: ${hasAudio}`
  );

  if (
    (hasAudioUrl || extractorKey === 'youtube') &&
    format !== 'mp3' &&
    !selectedFormat?.isMuxed
  ) {
    await handleTurboMux(
      url,
      info,
      options,
      extractor,
      selectedFormat,
      combinedStdout,
      extractorKey
    );
    return;
  }

  const rawStream = await extractor.getStream(info, { formatId, format });
  combinedStdout.emit('progress', 50);

  if (format === 'mp3') {
    const controller = new AbortController();
    const ffmpeg = spawn(
      'ffmpeg',
      ['-i', 'pipe:0', '-vn', '-ab', '192k', '-f', 'mp3', 'pipe:1'],
      {
        signal: controller.signal,
        detached: true,
      }
    );

    if (ffmpeg.stderr) ffmpeg.stderr.resume();

    combinedStdout.kill = () => {
      destroyStream(rawStream);
      controller.abort();
      gracefulKill(ffmpeg);
    };

    const { pipeline } = await import('node:stream/promises');

    Promise.all([
      pipeline(rawStream, ffmpeg.stdio[0] as import('stream').Writable, {
        signal: controller.signal,
      }),
      pipeline(ffmpeg.stdio[1] as import('stream').Readable, combinedStdout, {
        signal: controller.signal,
      }),
    ])
      .catch((error) => {
        if (
          error.name !== 'AbortError' &&
          error.code !== 'ERR_STREAM_PREMATURE_CLOSE'
        ) {
          console.error('[Streamer] FFmpeg Transcode Error:', error);
          Sentry.captureException(error);
          combinedStdout.emit('error', error);
        }
      })
      .finally(() => {
        if (combinedStdout.kill) combinedStdout.kill();
      });
  } else {
    rawStream.pipe(combinedStdout);
    combinedStdout.kill = () => {
      destroyStream(rawStream);
    };
  }

  rawStream.on('end', () => {
    combinedStdout.emit('progress', 100);
  });
}

function _resolveFString(
  options: StreamOptions,
  selectedFormat: Format
): string {
  const { format, formatId } = options;
  const isYtAudioOnly = ['mp3', 'm4a', 'audio'].includes(format || '');
  const effectiveAudioOnly =
    isYtAudioOnly || (format === 'mp4' && String(formatId).includes('audio'));

  if (
    !['mp3', 'm4a'].includes(format || '') &&
    formatId &&
    formatId !== 'best'
  ) {
    const cleanFid = String(formatId).split('-')[0];
    if (selectedFormat?.isMuxed) return cleanFid;
    // force rotation if muxed unavailable
    const targetHeight = selectedFormat?.height;
    const heightFilter = targetHeight
      ? `bv*[height<=${targetHeight}]+ba`
      : 'bv*+ba';
    return `${cleanFid}+bestaudio/${heightFilter}`;
  }

  return effectiveAudioOnly ? 'ba/ba*/b/best' : 'bv*+ba/b';
}

function _isCopyCompatible(selectedFormat: Format): boolean {
  const vcodec = selectedFormat?.vcodec || '';
  // mp4 stream-copy compatible codecs
  const isMp4CompatibleVideo =
    vcodec.startsWith('avc1') ||
    vcodec.startsWith('h264') ||
    vcodec.startsWith('av01') ||
    vcodec.startsWith('vp09') ||
    vcodec.startsWith('vp9') ||
    vcodec.startsWith('hev1') ||
    vcodec.startsWith('hvc1');
  const acodec = selectedFormat?.acodec || '';
  // aac, opus, none all copy clean
  const isCopyableAudio =
    acodec === 'none' ||
    acodec === '' ||
    acodec.startsWith('mp4a') ||
    acodec.includes('aac') ||
    acodec.startsWith('opus');
  return Boolean(isMp4CompatibleVideo && isCopyableAudio);
}

// client mix handles POT bypass
// tv most reliable for DASH with cookies
const YT_CLIENTS = ['tv', 'android_vr', 'mweb', 'web_embedded'] as const;

// formats not on android_vr — use mweb
const HIGH_RES_FORMATS = new Set([
  '401',
  '571',
  '337', // av1/vp9 4k+
  '315',
  '272',
  '308', // vp9 4k
  '313',
  '266', // vp9 4k/8k
]);

function pickBestClient(selectedFormat: Format | undefined): number {
  if (!selectedFormat) return 0;
  const fid = String(selectedFormat.formatId || '');
  const height = selectedFormat.height || 0;
  const vcodec = String(selectedFormat.vcodec || '');
  // android_vr never serves av1; route to mweb
  if (vcodec.startsWith('av01')) {
    return YT_CLIENTS.indexOf('mweb');
  }
  // 4k+ needs tv (mweb needs POT)
  if (HIGH_RES_FORMATS.has(fid) || height >= 2160) {
    return YT_CLIENTS.indexOf('tv');
  }
  return 0;
}

function buildYtdlpArgs(
  options: StreamOptions,
  selectedFormat: Format,
  cookieArgs: string[],
  clientIndex = 0,
  formats: Format[] = [],
  outputTarget = '-'
): string[] {
  const { format } = options;
  const isYtAudioOnly = ['mp3', 'm4a', 'audio'].includes(format || '');

  const fString = _resolveFString(options, selectedFormat);
  const effectiveCookieArgs = COMMON_ARGS.includes('--cookies')
    ? []
    : cookieArgs;
  const args = [
    ...effectiveCookieArgs,
    '--user-agent',
    USER_AGENT,
    ...COMMON_ARGS,
    '--no-playlist',
    '--flat-playlist',
    '--no-check-formats',
    '--no-check-certificate',
    '--extractor-args',
    `youtube:player-client=${YT_CLIENTS[clientIndex % YT_CLIENTS.length]}`,
    '-f',
    fString,
    '--newline',
    '--progress',
    '-o',
    outputTarget,
  ];

  const isMerging = fString.includes('+');

  if (!isYtAudioOnly && isMerging) {
    args.push('--merge-output-format', 'mp4');
  }

  const shouldCopy = _isCopyCompatible(selectedFormat);

  if (isMerging) {
    // detect paired audio for bsf filter
    const bestAudio = formats.find(
      (fmt) => fmt.acodec && fmt.acodec !== 'none' && fmt.vcodec === 'none'
    );
    const pairedAcodec = bestAudio?.acodec || selectedFormat?.acodec || '';
    const audioIsAAC =
      pairedAcodec.startsWith('mp4a') || pairedAcodec.includes('aac');

    if (!isYtAudioOnly) {
      if (shouldCopy) {
        // native dl, 50x faster than ffmpeg
        // bsf only if source is aac
        const bsfArg = audioIsAAC ? ['-bsf:a', 'aac_adtstoasc'] : [];
        args.push(
          '--postprocessor-args',
          `ffmpeg:-c:v copy -c:a copy ${bsfArg.join(' ')} -movflags +faststart`.trim()
        );
      } else {
        // transcode requires ffmpeg downloader
        const height = selectedFormat?.height || 0;
        const preset = height >= 1080 ? 'superfast' : 'ultrafast';
        args.push(
          '--downloader',
          'ffmpeg',
          '--downloader-args',
          `ffmpeg:-c:v libx264 -preset ${preset} -threads 0 -crf 23 -c:a aac -b:a 128k -bsf:a aac_adtstoasc -f mp4 -movflags +faststart -ignore_unknown`
        );
      }
    }
  }

  return args;
}

function handleYtdlpOutput(
  childProcess: ChildProcess,
  format: string,
  combinedStdout: StreamerProcess,
  wasUsingCache: boolean,
  retryCallback: () => void,
  tempFile: string | null = null
) {
  if (tempFile) {
    // file mode: native dl, pipe after
    let capturedStderr = '';
    let lastProgressLog = 0;
    if (childProcess.stderr) {
      childProcess.stderr.on('data', (chunk) => {
        const msg = chunk.toString();
        capturedStderr += msg;
        // surface stderr lines with throttled progress
        for (const line of msg.split('\n')) {
          if (!line.trim()) continue;
          const isProgress = /\[download\]\s+\d+\.\d+%/u.test(line);
          if (isProgress) {
            const now = Date.now();
            if (now - lastProgressLog > 3000) {
              console.log(`[ytdlp] ${line.trim()}`);
              lastProgressLog = now;
            }
          } else {
            console.log(`[ytdlp] ${line.trim()}`);
          }
        }
        const match = msg.match(/\[download\]\s+(\d+\.\d+)%/u);
        if (match) combinedStdout.emit('progress', parseFloat(match[1]));
      });
    }

    // watchdog logs temp file growth
    const watchdog = setInterval(async () => {
      try {
        const { statSync, readdirSync } = await import('node:fs');
        const path = await import('node:path');
        const dir = path.dirname(tempFile);
        const base = path.basename(tempFile, path.extname(tempFile));
        // intermediate .fXXX.webm/.mp4 during dl
        const siblings = readdirSync(dir).filter((name) =>
          name.startsWith(base)
        );
        let totalBytes = 0;
        const summary: string[] = [];
        for (const name of siblings) {
          try {
            const stats = statSync(path.join(dir, name));
            totalBytes += stats.size;
            summary.push(`${name}=${(stats.size / 1024 / 1024).toFixed(1)}MB`);
          } catch {
            // file disappeared between readdir and stat
          }
        }
        if (siblings.length === 0) {
          console.log('[Streamer-Watchdog] no temp files yet');
        } else {
          console.log(
            `[Streamer-Watchdog] total=${(totalBytes / 1024 / 1024).toFixed(1)}MB | ${summary.join(', ')}`
          );
        }
      } catch {
        console.log('[Streamer-Watchdog] dir unreadable');
      }
    }, 10000);
    childProcess.on('close', () => clearInterval(watchdog));
    childProcess.on('close', async (code) => {
      if (code !== 0) {
        console.error(
          `[Streamer] yt-dlp exited with code ${code}. Stderr: ${capturedStderr}`
        );
        const isRetryable =
          capturedStderr.includes('403') ||
          capturedStderr.includes('Forbidden') ||
          capturedStderr.includes('503') ||
          capturedStderr.includes('Service Unavailable') ||
          capturedStderr.includes('Server returned 5XX') ||
          capturedStderr.includes('Requested format is not available') ||
          capturedStderr.includes('Sign in to confirm');
        if (isRetryable) {
          console.log(
            '[Streamer] retryable error detected, rotating client...'
          );
          retryCallback();
          return;
        }
        if (!combinedStdout.writableEnded) combinedStdout.end();
        return;
      }
      // download complete, stream file to client
      try {
        const { createReadStream } = await import('node:fs');
        const { unlink } = await import('node:fs/promises');

        const fileStream = createReadStream(tempFile);
        fileStream.pipe(combinedStdout);
        fileStream.on('end', async () => {
          combinedStdout.emit('progress', 100);
          try {
            await unlink(tempFile);
          } catch {
            // ignore cleanup failure
          }
        });
        fileStream.on('error', (error) => {
          console.error('[Streamer] file stream error:', error.message);
          if (!combinedStdout.writableEnded) combinedStdout.end();
        });
      } catch (error: unknown) {
        console.error(
          '[Streamer] failed to read temp file:',
          (error as Error).message
        );
        if (!combinedStdout.writableEnded) combinedStdout.end();
      }
    });
    return;
  }

  if (format === 'mp3') {
    const controller = new AbortController();
    const ffmpeg = spawn(
      'ffmpeg',
      ['-i', 'pipe:0', '-vn', '-ab', '192k', '-f', 'mp3', 'pipe:1'],
      {
        signal: controller.signal,
        detached: true,
      }
    );

    if (ffmpeg.stderr) ffmpeg.stderr.resume();

    const originalKill = combinedStdout.kill;
    combinedStdout.kill = () => {
      gracefulKill(childProcess);
      controller.abort();
      gracefulKill(ffmpeg);
      if (originalKill) originalKill();
    };

    if (childProcess.stdout) {
      import('node:stream/promises').then(({ pipeline }) => {
        Promise.all([
          pipeline(
            childProcess.stdout as import('stream').Readable,
            ffmpeg.stdio[0] as import('stream').Writable,
            { signal: controller.signal }
          ),
          pipeline(
            ffmpeg.stdio[1] as import('stream').Readable,
            combinedStdout,
            { signal: controller.signal }
          ),
        ])
          .catch((error) => {
            if (
              error.name !== 'AbortError' &&
              error.code !== 'ERR_STREAM_PREMATURE_CLOSE'
            ) {
              console.error('[Streamer] FFmpeg Transcode Error:', error);
              Sentry.captureException(error);
              combinedStdout.emit('error', error);
            }
          })
          .finally(() => {
            if (combinedStdout.kill) combinedStdout.kill();
          });
      });
    }
  } else {
    if (childProcess.stdout)
      childProcess.stdout.pipe(combinedStdout, { end: false });
  }

  let capturedStderr = '';
  if (childProcess.stderr) {
    childProcess.stderr.on('data', (chunk) => {
      const msg = chunk.toString();
      capturedStderr += msg;
      const match = msg.match(/\[download\]\s+(\d+\.\d+)%/u);
      if (match) combinedStdout.emit('progress', parseFloat(match[1]));
    });
  }

  childProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(
        `[Streamer] yt-dlp exited with code ${code}. Stderr: ${capturedStderr}`
      );
      const isRetryable =
        capturedStderr.includes('403') ||
        capturedStderr.includes('Forbidden') ||
        capturedStderr.includes('503') ||
        capturedStderr.includes('Service Unavailable') ||
        capturedStderr.includes('Server returned 5XX') ||
        capturedStderr.includes('Requested format is not available') ||
        capturedStderr.includes('Sign in to confirm');
      if (isRetryable) {
        console.log('[Streamer] retryable error detected, rotating client...');
        retryCallback();
        return;
      }
    }
    if (!combinedStdout.writableEnded) combinedStdout.end();
  });
}

function getStreamMeta(info: VideoInfo | SpotifyMetadata, url: string) {
  // ensure correct extractor mapping
  const inferredKey = url.includes('spotify.com')
    ? 'spotify'
    : url.includes('youtube.com') || url.includes('youtu.be')
      ? 'youtube'
      : url.includes('tiktok.com')
        ? 'tiktok'
        : url.includes('facebook.com') || url.includes('fb.watch')
          ? 'facebook'
          : url.includes('instagram.com')
            ? 'instagram'
            : url.includes('soundcloud.com')
              ? 'soundcloud'
              : 'youtube';

  const extractorKey =
    ('extractorKey' in info ? info.extractorKey : inferredKey) || inferredKey;
  const isSpotify =
    url.includes('spotify.com') ||
    info.type === 'spotify' ||
    extractorKey.toLowerCase() === 'spotify';
  const platform = isSpotify
    ? 'Spotify'
    : extractorKey.charAt(0).toUpperCase() + extractorKey.slice(1);
  return { extractorKey, isSpotify, platform };
}

function checkJSStream(extractorKey: string) {
  return ['facebook', 'instagram', 'soundcloud'].includes(extractorKey);
}

async function tryChunkedFetch(
  url: string,
  selectedFormat: Format,
  options: StreamOptions,
  cookieArgs: string[],
  combinedStdout: StreamerProcess,
  platform: string
): Promise<boolean> {
  const tid = getTraceId() || 'global';
  // transplant mutates this without re-creating provider
  let currentUrl = selectedFormat.url || '';
  if (!currentUrl) return false;

  const httpHeaders =
    (selectedFormat as unknown as { http_headers?: Record<string, string> })
      .http_headers || {};

  const controller = new AbortController();

  const urlProvider = () =>
    Promise.resolve({
      url: currentUrl,
      headers: { 'user-agent': USER_AGENT, ...httpHeaders },
    });

  const transplant = async () => {
    const { getVideoInfo } = await import('./info.js');
    const fresh = await getVideoInfo(url, cookieArgs);
    if (!fresh || !Array.isArray(fresh.formats)) {
      throw new Error('transplant: re-extraction returned no formats');
    }
    const match = fresh.formats.find(
      (fmt: Format) => String(fmt.formatId) === String(options.formatId)
    );
    if (!match?.url) {
      throw new Error(
        `transplant: format ${options.formatId} missing in fresh info`
      );
    }
    console.log(
      `[Streamer] [${tid}] Transplant successful, URL refreshed for format ${options.formatId}`
    );
    currentUrl = match.url;
  };

  try {
    const { fetchChunked } = await import('./chunked-fetcher.js');
    console.log(
      `[Streamer] [${tid}] Engine: Chunked-Fetch | Platform: ${platform} | URL: ${currentUrl.substring(0, 60)}...`
    );
    const { stream, size } = await fetchChunked({
      urlProvider,
      transplant,
      controller,
      service: 'youtube',
    });
    console.log(
      `[Streamer] [${tid}] Chunked pre-flight OK; size=${(Number(size) / 1024 / 1024).toFixed(1)}MB`
    );

    stream.on('error', (error: Error) => {
      console.error('[Streamer] Chunked stream error:', error.message);
      combinedStdout.emit('error', error);
    });
    stream.on('end', () => combinedStdout.emit('progress', 100));
    stream.pipe(combinedStdout);

    combinedStdout.kill = () => {
      controller.abort();
      destroyStream(stream);
    };
    return true;
  } catch (error: unknown) {
    console.log(
      `[Streamer] [${tid}] Chunked fetch failed, falling back: ${(error as Error).message}`
    );
    return false;
  }
}

async function tryDirectFetch(
  url: string,
  selectedFormat: Format,
  combinedStdout: StreamerProcess,
  platform: string
): Promise<boolean> {
  if (!selectedFormat?.url) return false;
  console.log(
    `[Streamer] Engine: Node-Fetch (Direct) | Platform: ${platform} | URL: ${url}`
  );
  try {
    const { getQuantumStream } =
      await import('../../utils/network/proxy.util.js');
    const directStream = getQuantumStream(selectedFormat.url, {
      'User-Agent': USER_AGENT,
      ...((
        selectedFormat as unknown as {
          http_headers?: Record<string, string>;
        }
      ).http_headers || {}),
    });
    directStream.on('error', (error: NodeJS.ErrnoException) => {
      combinedStdout.emit('error', error);
    });
    directStream.pipe(combinedStdout);
    directStream.on('end', () => combinedStdout.emit('progress', 100));
    combinedStdout.kill = () => {
      destroyStream(directStream);
    };
    return true;
  } catch (error: unknown) {
    console.log(
      '[Streamer] Direct fetch failed, falling back to yt-dlp process:',
      (error as Error).message
    );
    return false;
  }
}

function isDirectFetchable(
  selectedFormat: Format,
  isMerging: boolean
): boolean {
  if (isMerging || !selectedFormat?.url) return false;
  return (
    !selectedFormat.url.includes('.m3u8') &&
    !selectedFormat.url.includes('manifest')
  );
}

async function tryNetworkFetchPath(
  url: string,
  selectedFormat: Format,
  options: StreamOptions,
  cookieArgs: string[],
  combinedStdout: StreamerProcess,
  platform: string,
  extractorKey: string
): Promise<boolean> {
  if (extractorKey === 'youtube') {
    const chunkedOk = await tryChunkedFetch(
      url,
      selectedFormat,
      options,
      cookieArgs,
      combinedStdout,
      platform
    );
    if (chunkedOk) return true;
  }
  return tryDirectFetch(url, selectedFormat, combinedStdout, platform);
}

async function tryYouTubeTurboMux(
  url: string,
  selectedFormat: Format,
  formats: Format[],
  options: StreamOptions,
  cookieArgs: string[],
  combinedStdout: StreamerProcess
): Promise<boolean> {
  const tid = getTraceId() || 'global';
  const videoUrl = selectedFormat?.url;
  if (!videoUrl) return false;

  // find best audio with direct URL
  const audioFormat = formats.find(
    (fmt) => fmt.acodec && fmt.acodec !== 'none' && fmt.vcodec === 'none' && fmt.url
  );
  if (!audioFormat?.url) return false;

  const httpHeaders =
    (selectedFormat as unknown as { http_headers?: Record<string, string> })
      .http_headers || {};

  let currentVideoUrl = videoUrl;
  let currentAudioUrl = audioFormat.url;

  const videoController = new AbortController();
  const audioController = new AbortController();

  const makeProvider = (getUrl: () => string) => () =>
    Promise.resolve({
      url: getUrl(),
      headers: { 'user-agent': USER_AGENT, ...httpHeaders },
    });

  const transplant = async () => {
    const fresh = await getVideoInfo(url, cookieArgs);
    if (!fresh?.formats) throw new Error('transplant failed');
    const vMatch = fresh.formats.find(
      (fmt: Format) => String(fmt.formatId) === String(options.formatId)
    );
    const aMatch = fresh.formats.find(
      (fmt: Format) => String(fmt.formatId) === String(audioFormat.formatId)
    );
    if (vMatch?.url) currentVideoUrl = vMatch.url;
    if (aMatch?.url) currentAudioUrl = aMatch.url;
    console.log(`[TurboMux] [${tid}] Transplant OK`);
  };

  try {
    const { fetchChunked } = await import('./chunked-fetcher.js');

    console.log(
      `[TurboMux] [${tid}] Starting real-time mux: video=${selectedFormat.formatId} audio=${audioFormat.formatId}`
    );

    const [videoResult, audioResult] = await Promise.all([
      fetchChunked({
        urlProvider: makeProvider(() => currentVideoUrl),
        transplant,
        controller: videoController,
        service: 'youtube',
      }),
      fetchChunked({
        urlProvider: makeProvider(() => currentAudioUrl),
        transplant,
        controller: audioController,
        service: 'youtube',
      }),
    ]);

    const isAAC =
      audioFormat.acodec?.startsWith('mp4a') ||
      audioFormat.acodec?.includes('aac');
    const audioCodec = isAAC ? 'copy' : 'aac';

    const ffmpeg = spawn(
      'ffmpeg',
      [
        '-i', 'pipe:0',
        '-i', 'pipe:3',
        '-c:v', 'copy',
        '-c:a', audioCodec,
        '-map', '0:v?',
        '-map', '1:a?',
        '-shortest',
        '-f', 'mp4',
        '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
        '-frag_duration', '1000000',
        'pipe:1',
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
        detached: true,
      }
    );

    if (ffmpeg.stdio[2])
      (ffmpeg.stdio[2] as Readable).resume();

    const pipe3 = ffmpeg.stdio[3] as import('stream').Writable;
    if (!pipe3) throw new Error('ffmpeg pipe:3 unavailable');

    combinedStdout.kill = () => {
      videoController.abort();
      audioController.abort();
      gracefulKill(ffmpeg);
    };

    const { pipeline } = await import('node:stream/promises');

    Promise.all([
      pipeline(videoResult.stream, ffmpeg.stdio[0] as import('stream').Writable),
      pipeline(audioResult.stream, pipe3),
      pipeline(ffmpeg.stdio[1] as Readable, combinedStdout),
    ]).catch((error) => {
      if (
        error.name !== 'AbortError' &&
        error.code !== 'ERR_STREAM_PREMATURE_CLOSE'
      ) {
        console.error('[TurboMux] Pipeline error:', error.message);
        combinedStdout.emit('error', error);
      }
    }).finally(() => {
      gracefulKill(ffmpeg);
    });

    console.log(
      `[TurboMux] [${tid}] Piping started — video=${(Number(videoResult.size) / 1024 / 1024).toFixed(1)}MB audio=${(Number(audioResult.size) / 1024 / 1024).toFixed(1)}MB`
    );
    return true;
  } catch (error: unknown) {
    console.log(
      `[TurboMux] [${tid}] Failed, falling back: ${(error as Error).message}`
    );
    videoController.abort();
    audioController.abort();
    return false;
  }
}

async function attemptTurboMux(
  url: string,
  selectedFormat: Format,
  formats: Format[],
  options: StreamOptions,
  cookieArgs: string[],
  combinedStdout: StreamerProcess,
  formatId: string
): Promise<boolean> {
  const client = 'tv';
  const tid = getTraceId() || 'global';
  try {
    // cache key: video ID + format
    const videoId = url.match(/(?:v=|\/v\/|youtu\.be\/)([0-9A-Za-z_-]{11})/)?.[1] || url;
    const cacheKey = `turbomux:${videoId}:${formatId}`;
    const createRedisClient = (await import('../../utils/infra/redis.util.js')).default;
    const redis = createRedisClient('MetadataCache');

    // check cache (4h TTL)
    let videoUrl: string | undefined;
    let audioUrl: string | undefined;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        videoUrl = parsed.video;
        audioUrl = parsed.audio;
        console.log(`[TurboMux] [${tid}] Cache HIT`);
      }
    } catch { /* cache miss or parse error */ }

    // miss → resolve via yt-dlp
    if (!videoUrl || !audioUrl) {
      console.log(`[TurboMux] [${tid}] Refreshing URLs via ${client}...`);
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const exec = promisify(execFile);
      const effectiveCookieArgs = COMMON_ARGS.includes('--cookies')
        ? ['--cookies', COMMON_ARGS[COMMON_ARGS.indexOf('--cookies') + 1]]
        : cookieArgs;
      const { stdout } = await exec('yt-dlp', [
        '-f', `${formatId}+bestaudio`,
        '--get-url',
        '--no-playlist',
        '--no-warnings',
        '--no-check-formats',
        '--extractor-args', `youtube:player-client=${client}`,
        ...effectiveCookieArgs,
        url,
      ], { timeout: 15000 });
      const urls = stdout.trim().split('\n').filter(Boolean);
      if (urls.length < 2) {
        console.log(`[TurboMux] [${tid}] Got ${urls.length} URLs, need 2`);
        return false;
      }
      [videoUrl, audioUrl] = urls;
      // cache for 4 hours
      redis.set(cacheKey, JSON.stringify({ video: videoUrl, audio: audioUrl }), 'EX', 14400).catch(() => {});
    }

    const muxSelected: Format = { ...selectedFormat, formatId, url: videoUrl };
    const syntheticAudio: Format = {
      formatId: 'bestaudio',
      url: audioUrl,
      vcodec: 'none',
      acodec: 'opus',
    } as Format;
    return tryYouTubeTurboMux(
      url, muxSelected, [muxSelected, syntheticAudio, ...formats],
      options, cookieArgs, combinedStdout
    );
  } catch (err: unknown) {
    console.log(`[TurboMux] [${tid}] Failed: ${(err as Error).message}`);
    return false;
  }
}

export function streamDownload(
  url: string,
  options: StreamOptions,
  cookieArgs: string[] = [],
  preFetchedInfo: VideoInfo | null = null
): StreamerProcess {
  const { format, formatId } = options;
  const combinedStdout: StreamerProcess = new PassThrough();
  let activeChildProcess: ChildProcess | null = null;

  (async () => {
    try {
      const info: VideoInfo =
        preFetchedInfo ||
        (await getVideoInfo(url, cookieArgs)) ||
        ({} as VideoInfo);
      const { extractorKey, platform } = getStreamMeta(info, url);
      const { getExtractor } = await import('../extractors/index.js');

      const extractor = extractorKey
        ? ((await getExtractor(url)) as Extractor)
        : null;
      const formats = Array.isArray(info.formats) ? info.formats : [];
      const selectedFormat =
        formats.find(
          (formatItem: Format) =>
            String(formatItem.formatId) === String(formatId)
        ) || formats[0];

      if (extractor && checkJSStream(extractorKey)) {
        try {
          await handlePureJSStream(
            url,
            info,
            options,
            extractor,
            selectedFormat,
            combinedStdout,
            platform,
            extractorKey
          );
          return;
        } catch (error: unknown) {
          console.warn(
            '[Streamer] JS Direct-Pipe failed, falling back to yt-dlp:',
            (error as Error).message
          );
        }
      }

      const probeArgs = buildYtdlpArgs(
        options,
        selectedFormat,
        cookieArgs,
        0,
        formats
      );
      const isMerging = probeArgs.includes('--merge-output-format');

      if (isDirectFetchable(selectedFormat, isMerging)) {
        const handled = await tryNetworkFetchPath(
          url,
          selectedFormat,
          options,
          cookieArgs,
          combinedStdout,
          platform,
          extractorKey
        );
        if (handled) return;
      }

      // real-time mux for YouTube merges (video+audio)
      if (isMerging && extractorKey === 'youtube') {
        const turboOk = await attemptTurboMux(
          url, selectedFormat, formats, options, cookieArgs, combinedStdout, formatId
        );
        if (turboOk) return;
      }

      const tid = getTraceId() || 'global';
      console.log(
        `[Download] [${tid}] Engine: yt-dlp | Platform: ${platform} | URL: ${url}`
      );
      const fallbackUrl = info.targetUrl || url;
      const youtubeId =
        (info.targetUrl || info.webpageUrl || '').match(
          /(?:v=|\/v\/)([0-9A-Za-z_-]{11})/
        )?.[1] || info.id;
      const cachedJsonPath = path.join(
        CACHE_DIR,
        'metadata',
        `${youtubeId}.json`
      );
      // stale nsig = throttled; skip cache
      const useCache = false;
      // merge mode: temp file 50x faster
      const fsSync = await import('node:fs');
      const useTempFile = isMerging;
      let tempPath = '-';
      if (useTempFile) {
        const tmpDir = path.join(CACHE_DIR, 'tmp');
        try {
          fsSync.mkdirSync(tmpDir, { recursive: true });
        } catch {
          // ignore mkdir failure
        }
        tempPath = path.join(
          tmpDir,
          `${youtubeId || Date.now()}_${Math.random().toString(36).slice(2, 8)}.${options.format === 'webm' ? 'webm' : 'mp4'}`
        );
      }

      const spawnYtdlp = (withCache = false, clientIndex = 0) => {
        const currentArgs = [
          ...buildYtdlpArgs(
            options,
            selectedFormat,
            cookieArgs,
            clientIndex,
            formats,
            tempPath
          ),
        ];
        if (withCache) currentArgs.push('--load-info-json', cachedJsonPath);
        else currentArgs.push(fallbackUrl);
        return spawn('yt-dlp', currentArgs, { detached: true });
      };

      const startClient = pickBestClient(selectedFormat);
      const tried = new Set<number>([startClient]);

      const retryWithClient = (clientIndex: number) => {
        // skip already-tried clients
        while (clientIndex < YT_CLIENTS.length && tried.has(clientIndex)) {
          clientIndex++;
        }
        if (clientIndex >= YT_CLIENTS.length) {
          if (!combinedStdout.writableEnded) combinedStdout.end();
          return;
        }
        tried.add(clientIndex);
        console.log(
          `[Streamer] Rotating to client: ${YT_CLIENTS[clientIndex]}`
        );
        // cleanup leftover temp file from retry
        if (useTempFile && fsSync.existsSync(tempPath)) {
          try {
            fsSync.unlinkSync(tempPath);
          } catch {
            /* ignore */
          }
        }
        activeChildProcess = spawnYtdlp(false, clientIndex);
        handleYtdlpOutput(
          activeChildProcess,
          format,
          combinedStdout,
          false,
          () => retryWithClient(clientIndex + 1),
          useTempFile ? tempPath : null
        );
      };

      console.log(
        `[Streamer] Starting with client: ${YT_CLIENTS[startClient]} (formatId=${selectedFormat?.formatId})${useTempFile ? ' [temp file mode]' : ''}`
      );
      activeChildProcess = spawnYtdlp(useCache, startClient);
      handleYtdlpOutput(
        activeChildProcess,
        format,
        combinedStdout,
        useCache,
        () => retryWithClient(0),
        useTempFile ? tempPath : null
      );
    } catch (error: unknown) {
      console.error('[Streamer] fatal:', (error as Error).message);
      Sentry.captureException(error);
      combinedStdout.emit('error', error);
    }
  })();

  combinedStdout.kill =
    combinedStdout.kill ||
    (() => {
      if (activeChildProcess) gracefulKill(activeChildProcess);
    });
  return combinedStdout;
}

export function spawnDownload(
  url: string,
  options: StreamOptions & { tempFilePath: string },
  cookieArgs: string[] = []
): ChildProcess {
  const { format, formatId, tempFilePath } = options;
  const baseArgs = [
    ...cookieArgs,
    '--user-agent',
    USER_AGENT,
    ...COMMON_ARGS,
    '--cache-dir',
    CACHE_DIR,
    '--newline',
    '--progress',
    '-o',
    tempFilePath,
  ];
  let args: string[];
  if (['mp3', 'm4a', 'webm', 'audio'].includes(format)) {
    const fId =
      formatId && formatId !== 'mp3' && formatId !== 'm4a'
        ? `${formatId}/ba/b`
        : 'ba/b';
    args =
      format !== 'mp3'
        ? ['-f', fId, ...baseArgs, url]
        : [
            '-f',
            fId,
            '--extract-audio',
            '--audio-format',
            'mp3',
            ...baseArgs,
            url,
          ];
  } else {
    args = [
      '-f',
      formatId ? `${formatId}+ba/ba/b` : 'bv*[vcodec^=avc1]+ba/b',
      '-S',
      'res,vcodec:h264',
      '--merge-output-format',
      'mp4',
      ...baseArgs,
      url,
    ];
  }
  return spawn('yt-dlp', args, { detached: true });
}
