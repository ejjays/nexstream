import { spawn, ChildProcess } from 'node:child_process';
import * as Sentry from '@sentry/node';
import { PassThrough, Readable } from 'node:stream';
import fs from 'node:fs';
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

  const effectiveAudioOnly =
    isYtAudioOnly || (format === 'mp4' && String(formatId).includes('audio'));
  let fString = effectiveAudioOnly ? 'ba/ba*/b/best' : 'bv*+ba/b';

  if (!isMp3 && !isM4a && formatId && formatId !== 'best') {
    const cleanFid = String(formatId).split('-')[0];
    if (selectedFormat?.isMuxed) {
      fString = cleanFid;
    } else {
      fString = `${cleanFid}+bestaudio/best`;
    }
  }

  const args = [
    ...cookieArgs,
    '--user-agent',
    USER_AGENT,
    ...COMMON_ARGS,
    '--no-playlist',
    '--flat-playlist',
    '--no-check-formats',
    '--no-check-certificate',
    '--extractor-args',
    'youtube:player-client=web,android,mweb',
    '-f',
    fString,
    '--newline',
    '--progress',
    '-o',
    '-',
  ];

  const isMerging = fString.includes('+');

  if (!isYtAudioOnly && isMerging) {
    args.push('--merge-output-format', isWebm ? 'webm' : 'mp4');
  }

  const isNativeH264 =
    selectedFormat?.vcodec?.startsWith('avc1') ||
    selectedFormat?.vcodec?.startsWith('h264');
  const isNativeAAC =
    selectedFormat?.acodec?.startsWith('mp4a') ||
    selectedFormat?.acodec?.includes('aac');
  const shouldCopy =
    isNativeH264 &&
    (isNativeAAC ||
      !selectedFormat?.acodec ||
      selectedFormat.acodec === 'none');

  if (isMerging) {
    if (isWebm) {
      args.push(
        '--downloader',
        'ffmpeg',
        '--downloader-args',
        'ffmpeg:-f matroska -live 1 -flush_packets 1'
      );
    } else if (!isYtAudioOnly) {
      if (shouldCopy) {
        args.push(
          '--downloader',
          'ffmpeg',
          '--downloader-args',
          'ffmpeg:-c:v copy -c:a copy -bsf:a aac_adtstoasc -f mp4 -movflags frag_keyframe+empty_moov+default_base_moof -frag_duration 1000000 -ignore_unknown'
        );
      } else {
        const height = selectedFormat?.height || 0;
        const preset = height >= 1080 ? 'superfast' : 'ultrafast';
        args.push(
          '--downloader',
          'ffmpeg',
          '--downloader-args',
          `ffmpeg:-c:v libx264 -preset ${preset} -threads 0 -crf 23 -c:a aac -b:a 128k -bsf:a aac_adtstoasc -f mp4 -movflags frag_keyframe+empty_moov+default_base_moof -frag_duration 1000000 -ignore_unknown`
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
  retryCallback: () => void
) {
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
    if (childProcess.stdout) childProcess.stdout.pipe(combinedStdout);
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
      if (
        wasUsingCache &&
        (capturedStderr.includes('403') || capturedStderr.includes('Forbidden'))
      ) {
        console.log('[Streamer] 403 detected, retrying without cache...');
        retryCallback();
        return;
      }
    }
    if (!combinedStdout.writableEnded) combinedStdout.end();
  });
}

function getStreamMeta(info: VideoInfo | SpotifyMetadata, url: string) {
  const extractorKey =
    ('extractorKey' in info ? info.extractorKey : 'spotify') || '';
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

      const args = buildYtdlpArgs(options, selectedFormat, cookieArgs);

      const isMerging = args.includes('--merge-output-format');

      if (
        !isMerging &&
        selectedFormat?.url &&
        !selectedFormat.url.includes('.m3u8') &&
        !selectedFormat.url.includes('manifest')
      ) {
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
          return;
        } catch (error: unknown) {
          console.log(
            '[Streamer] Direct fetch failed, falling back to yt-dlp process:',
            (error as Error).message
          );
        }
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
      const useCache = fs.existsSync(cachedJsonPath);

      const spawnYtdlp = (withCache = false) => {
        const currentArgs = [...args];
        if (withCache) currentArgs.push('--load-info-json', cachedJsonPath);
        else currentArgs.push(fallbackUrl);
        return spawn('yt-dlp', currentArgs, { detached: true });
      };

      const noopRetry = () => {
        /* no further retry */
      };

      activeChildProcess = spawnYtdlp(useCache);
      handleYtdlpOutput(
        activeChildProcess,
        format,
        combinedStdout,
        useCache,
        () => {
          activeChildProcess = spawnYtdlp(false);
          handleYtdlpOutput(
            activeChildProcess,
            format,
            combinedStdout,
            false,
            noopRetry
          );
        }
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
