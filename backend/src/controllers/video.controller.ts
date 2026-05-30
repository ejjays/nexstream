import { Request, Response } from 'express';
import * as Sentry from '@sentry/node'; // skipcq: JS-C1003
import {
  addClient,
  removeClient,
  sendEvent,
} from '../utils/network/sse.util.js';
import { saveToBrain } from '../services/spotify.service.js';
import {
  isSupportedUrl,
  isValidSpotifyUrl,
} from '../utils/network/validation.util.js';
import { pipeWebStream } from '../utils/network/proxy.util.js';
import { verifyProxyParams } from '../utils/network/secrets.util.js';
import { recordFailure } from '../utils/infra/metrics.util.js';
import { pipeline } from 'node:stream/promises';
import { estimateFilesize } from '../utils/media/format.util.js';
import { getVideoInfo, streamDownload } from '../services/ytdlp.service.js';
import {
  detectService,
  getSanitizedFilename,
} from '../utils/media/video.util.js';
import {
  prepareFinalResponse,
  setupConvertResponse,
} from '../utils/api/response.util.js';
import {
  isAvc,
  selectVideoFormat,
  selectAudioFormat,
  buildProxyUrl,
  getOutputMetadata,
  setupStreamListeners,
} from '../utils/media/stream.util.js';
import {
  getCookieArgs,
  initializeSession,
  logExtractionSteps,
  resolveConvertTarget,
  resolveTargetFormat,
} from '../utils/api/controller.util.js';
import {
  processBackgroundTracks,
  type SeedTrack,
} from '../services/seeder.service.js';
import { getTracks, getData } from '../services/spotify/metadata.js';
import {
  VideoInfo,
  SpotifyMetadata,
  Format,
  FinalResponse,
} from '../types/index.js';

export const streamEvents = async (
  req: Request,
  res: Response
): Promise<void> => {
  const id = (req.query.id as string) || undefined;
  console.log(`[SSE] Client connecting: ${id}`);
  if (!id) {
    res.status(400).end();
    return;
  }
  await addClient(id, res);
};

async function _fetchMediaInfo(
  videoURL: string,
  clientId: string | undefined,
  serviceName: string,
  cookieArgs: string[]
): Promise<VideoInfo | null> {
  if (clientId) await logExtractionSteps(clientId, serviceName, 1);

  const info: VideoInfo | null = await getVideoInfo(
    videoURL,
    cookieArgs,
    false,
    null,
    clientId
  ).catch((error: unknown) => {
    console.error('[VideoInfo] Extraction failed:', (error as Error).message);
    return null;
  });

  if (clientId) await logExtractionSteps(clientId, serviceName, 3);
  return info;
}

function _handleSpotifyRegistry(
  info: VideoInfo,
  finalResponse: FinalResponse,
  videoURL: string,
  targetURL: string
) {
  if (info.fromBrain || !info.isJsInfo || !info.isIsrcMatch) return;

  console.log(
    `[Registry] Saving new mapping for: ${info.title} (ISRC: ${info.isrc})`
  );
  saveToBrain(videoURL, {
    ...info,
    cover: finalResponse.cover,
    formats: finalResponse.formats,
    audioFormats: finalResponse.audioFormats,
    targetUrl: targetURL,
  } as unknown as SpotifyMetadata);
}

const _decodeUrlIfNeeded = (url: string) => {
  if (url?.includes('%')) {
    try {
      const decoded = decodeURIComponent(url);
      if (decoded.startsWith('http')) return decoded;
    } catch (error: unknown) {
      console.debug(
        '[VideoController] URL decode error:',
        (error as Error).message
      );
    }
  }
  return url;
};

export const getVideoInformation = async (
  req: Request,
  res: Response
): Promise<void> => {
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );
  let videoURL = _decodeUrlIfNeeded(req.query.url as string);
  const clientId = (req.query.id as string) || undefined;

  if (videoURL) {
    videoURL = videoURL.split('&id=')[0].split('?id=')[0];
  }

  if (!videoURL || !isSupportedUrl(videoURL)) {
    res.status(400).json({ error: 'No valid URL provided' });
    return;
  }

  const serviceName = detectService(videoURL);
  await initializeSession(clientId);

  try {
    const cookieArgs = await getCookieArgs(videoURL, clientId);
    const isSpotify = videoURL.includes('spotify.com');

    const info = await _fetchMediaInfo(
      videoURL,
      clientId,
      serviceName,
      cookieArgs
    );

    // fast partial hit
    if (!info || (!info.formats?.length && !info.isPartial)) {
      res.json({
        title: info?.title || 'Unknown',
        thumbnail: info?.thumbnail || '',
        formats: [],
        audioFormats: [],
      });
      return;
    }

    const spotifyData = isSpotify
      ? ({ ...info, type: 'spotify' } as unknown as SpotifyMetadata)
      : null;
    const targetURL = isSpotify ? info.targetUrl || videoURL : videoURL;

    const finalResponse = await prepareFinalResponse(
      info,
      isSpotify,
      spotifyData,
      videoURL
    );
    if (isSpotify) {
      _handleSpotifyRegistry(info, finalResponse, videoURL, targetURL);
    }

    res.json(finalResponse);
  } catch (error: unknown) {
    recordFailure('info');
    console.error('[VideoInfo] Error:', (error as Error).message);
    Sentry.captureException(error);
    if (clientId) removeClient(clientId);
    if (!res.headersSent)
      res.status(500).json({ error: 'Failed to fetch video info' });
  }
};

function _resolveFormatDetails(
  info: VideoInfo,
  formatId: string,
  isSpotify: boolean
) {
  const requestedFormat = info.formats.find(
    (format: Format) => String(format.formatId) === String(formatId)
  );
  const isAudioStream = (format: Format | undefined) =>
    !format || !format.vcodec || format.vcodec === 'none';
  const isAudioOnly =
    formatId === 'mp3' || isSpotify || isAudioStream(requestedFormat);

  const finalVideoFormat = isAudioOnly
    ? null
    : selectVideoFormat(info.formats, formatId);
  const hasAudio = (format: Format | null) =>
    Boolean(format?.acodec && format?.acodec !== 'none');
  const needsWebm = Boolean(finalVideoFormat && !isAvc(finalVideoFormat));

  const finalAudioFormat =
    isAudioOnly || !hasAudio(finalVideoFormat)
      ? selectAudioFormat(info.formats, formatId, isAudioOnly, needsWebm)
      : null;

  return { isAudioOnly, finalVideoFormat, finalAudioFormat, requestedFormat };
}

function _determineExtension(
  isAudioOnly: boolean,
  finalVideoFormat: Format | null,
  finalAudioFormat: Format | null,
  requestedFormat: Format | undefined,
  formatId: string
) {
  let emeExtension = isAudioOnly ? finalAudioFormat?.extension || 'mp3' : 'mp4';
  if (formatId === 'photo') {
    emeExtension = requestedFormat?.extension || 'jpg';
  } else if (finalVideoFormat) {
    emeExtension = 'mp4';
  }
  return emeExtension;
}

function _buildStreamResponse(
  info: VideoInfo,
  videoTunnel: string | null | undefined,
  audioTunnel: string | null | undefined,
  isAudioOnly: boolean,
  filename: string,
  totalSize: number,
  outputMeta: Record<string, unknown>
) {
  if (videoTunnel && audioTunnel && !isAudioOnly) {
    return {
      status: 'local-processing',
      type: 'proxy',
      tunnel: [videoTunnel, audioTunnel],
      output: { filename, totalSize, ...outputMeta },
      videoUrl: videoTunnel,
      audioUrl: audioTunnel,
      title: info.title,
      filename,
    };
  }

  const tunnelPath = videoTunnel || audioTunnel;
  if (!tunnelPath || tunnelPath.includes('PENDING_DECIPHER')) {
    throw new Error(
      'No valid proxy tunnel could be resolved or stream is encrypted.'
    );
  }

  return {
    status: 'local-processing',
    type: 'proxy',
    tunnel: [tunnelPath],
    output: { filename, totalSize, ...outputMeta },
    videoUrl: isAudioOnly ? undefined : videoTunnel,
    audioUrl: audioTunnel,
    title: info.title,
    filename,
  };
}

function _parseRequestParams(req: Request) {
  const videoURLParam = req.query.url as string;
  const clientId = (req.query.id as string) || undefined;
  const formatId = req.query.formatId as string;

  const decoded = _decodeUrlIfNeeded(videoURLParam);
  const videoURL = decoded ? decoded.split('&id=')[0].split('?id=')[0] : '';
  return { videoURL, clientId, formatId };
}

async function _resolveManifests(
  req: Request,
  videoURL: string,
  clientId: string | undefined,
  formatId: string
) {
  const cookieArgs = await getCookieArgs(videoURL, clientId);
  const info: VideoInfo | null = await getVideoInfo(
    videoURL,
    cookieArgs,
    false,
    null,
    clientId
  ).catch(() => {
    /* ignore */ return null;
  });

  if (!info) throw new Error('Failed to fetch media information.');

  const isSpotify = videoURL.includes('spotify.com');
  const resolvedTargetURL = isSpotify ? info.targetUrl || videoURL : videoURL;

  const { isAudioOnly, finalVideoFormat, finalAudioFormat, requestedFormat } =
    _resolveFormatDetails(info, formatId, isSpotify);

  const videoTunnel = buildProxyUrl(
    req,
    finalVideoFormat,
    resolvedTargetURL as string
  );
  const audioTunnel = buildProxyUrl(
    req,
    finalAudioFormat,
    resolvedTargetURL as string
  );

  const emeExtension = _determineExtension(
    isAudioOnly,
    finalVideoFormat,
    finalAudioFormat,
    requestedFormat,
    formatId
  );
  const filename = getSanitizedFilename(
    info.title,
    info.uploader,
    emeExtension,
    isSpotify
  );
  const outputMeta = getOutputMetadata(isAudioOnly, emeExtension, info);

  let totalSize = 0;
  try {
    totalSize =
      (estimateFilesize(
        finalVideoFormat || ({} as Format),
        info.duration || 0
      ) || 0) +
      (estimateFilesize(
        finalAudioFormat || ({} as Format),
        info.duration || 0
      ) || 0);
  } catch (error: unknown) {
    console.warn('[Size] Estimation failed:', (error as Error).message);
  }

  return {
    info,
    videoTunnel,
    audioTunnel,
    isAudioOnly,
    filename,
    totalSize,
    outputMeta,
  };
}

export const getStreamUrls = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { videoURL, clientId, formatId } = _parseRequestParams(req);
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

  if (!videoURL || !isSupportedUrl(videoURL)) {
    res.status(400).json({ error: 'No valid URL provided' });
    return;
  }

  console.log(`[${timestamp}] [EME] Resolving manifests for Edge Muxing...`);

  try {
    const {
      info,
      videoTunnel,
      audioTunnel,
      isAudioOnly,
      filename,
      totalSize,
      outputMeta,
    } = await _resolveManifests(req, videoURL, clientId, formatId);
    res.json(
      _buildStreamResponse(
        info,
        videoTunnel,
        audioTunnel,
        isAudioOnly,
        filename,
        totalSize,
        outputMeta as Record<string, unknown>
      )
    );
  } catch (error: unknown) {
    recordFailure('stream_urls');
    console.error('[StreamUrls] Error:', (error as Error).message);
    Sentry.captureException(error);
    if (!res.headersSent)
      res.status(500).json({ error: 'Failed to resolve stream URLs' });
  }
};

export const proxyStream = async (
  req: Request,
  res: Response
): Promise<void> => {
  const queryData = req.query as Record<string, string | string[] | undefined>;
  let { targetUrl, formatId, url: rawFallbackUrl, filename } = queryData;
  if (Array.isArray(targetUrl)) targetUrl = targetUrl[0];
  if (Array.isArray(formatId)) formatId = formatId[0];
  if (Array.isArray(rawFallbackUrl)) rawFallbackUrl = rawFallbackUrl[0];
  if (Array.isArray(filename)) filename = filename[0];

  let rawUrl = queryData.rawUrl;
  if (Array.isArray(rawUrl)) rawUrl = rawUrl[0];

  // refuse forged or expired signed links
  if (
    !verifyProxyParams({
      targetUrl: targetUrl as string | undefined,
      rawUrl: rawUrl as string | undefined,
      formatId: formatId as string | undefined,
      exp: Number(req.query.exp),
      sig: req.query.sig as string | undefined,
    })
  ) {
    res.status(403).json({ error: 'Invalid or expired proxy signature' });
    return;
  }

  const urlToFetch = rawFallbackUrl || (req.query.rawUrl as string);
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

  if (urlToFetch) {
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());
    try {
      await pipeWebStream(
        urlToFetch,
        res,
        filename as string,
        req.headers as unknown as Record<string, string | undefined>,
        0,
        abortController.signal
      );
      return;
    } catch (error: unknown) {
      recordFailure('proxy');
      console.error('[Proxy] Raw Pipe Error:', (error as Error).message);
      Sentry.captureException(error);
      if (!res.headersSent)
        res.status(500).json({ error: 'Proxy fetch failed' });
      res.end();
      return;
    }
  }

  if (targetUrl && formatId) {
    console.log(`[${timestamp}] [EME] Proxying stream via yt-dlp...`);
    const { spawn: spawnChild } = await import('child_process');
    const { USER_AGENT: userAgent } =
      await import('../services/ytdlp/config.js');
    const { downloadCookies } = await import('../utils/network/cookie.util.js');

    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    const cleanFormatId = (formatId as string).split(/[-+]/u)[0];
    const isWebm =
      req.query.ext === 'webm' ||
      ['249', '250', '251', '271', '313'].includes(cleanFormatId);

    let mimeType = isWebm ? 'video/webm' : 'video/mp4';
    if (['249', '250', '251', '140'].includes(cleanFormatId)) {
      mimeType = isWebm ? 'audio/webm' : 'audio/mp4';
    }
    res.setHeader('Content-Type', mimeType);

    if (filename) {
      const safeName = encodeURIComponent(filename as string);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${safeName}`
      );
    }

    const cookieType = detectService(targetUrl as string).toLowerCase();
    const cookiesPath = await downloadCookies(
      cookieType === 'facebook' || cookieType === 'instagram'
        ? 'facebook'
        : 'youtube'
    );
    const cookieArgs = cookiesPath ? ['--cookies', cookiesPath] : [];

    const args = [
      ...cookieArgs,
      '--user-agent',
      userAgent,
      '--no-warnings',
      '--ignore-config',
      '-f',
      cleanFormatId,
      '-o',
      '-',
      targetUrl as string,
    ];

    const ytProcess = spawnChild('yt-dlp', args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const abortController = new AbortController();
    req.on('close', () => {
      abortController.abort();
      try {
        if (ytProcess.pid) {
          process.kill(-ytProcess.pid, 'SIGKILL');
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
          console.error('yt-dlp kill error', error);
      }
    });

    try {
      if (!ytProcess.stdout) throw new Error('yt-dlp stdout unavailable');
      await pipeline(ytProcess.stdout, res, { signal: abortController.signal });
    } catch (error: unknown) {
      const typedError = error as Error;
      if (typedError.name !== 'AbortError') {
        console.error('[Proxy] yt-dlp Pipe Error:', typedError.message);
        Sentry.captureException(typedError);
      }
    }
    if (!res.writableEnded) res.end();
    return;
  }

  res.status(400).end();
};

export const reportTelemetry = (req: Request, res: Response): void => {
  const { event } = req.body;
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
  const safeEvent = String(event || 'unknown').replaceAll(/[^\w]/gu, '_');
  console.log(`[${timestamp}] [EME] Client-Side Handshake: ${safeEvent}`);
  res.status(204).end();
};

async function _executeDownload(
  res: Response,
  clientId: string | undefined,
  videoURL: string,
  data: Record<string, unknown>,
  timestamp: string,
  filename: string,
  format: string,
  formatId: string | undefined,
  isSpotifyRequest: boolean
) {
  try {
    const cookieArgs = await getCookieArgs(videoURL, clientId, 'initializing');
    const resolvedTargetURL = await resolveConvertTarget(
      videoURL,
      data.targetUrl as string | undefined,
      cookieArgs
    );

    console.log(
      `[${timestamp}] [Turbo] Resolved target for download: ${resolvedTargetURL}`
    );

    const { info, targetFormat } = await resolveTargetFormat(
      format,
      resolvedTargetURL,
      resolvedTargetURL,
      cookieArgs,
      formatId,
      clientId,
      videoURL
    );

    if (!info) {
      throw new Error('Failed to fetch media information.');
    }

    const streamerUrl = info.targetUrl || resolvedTargetURL;

    if (isSpotifyRequest) {
      info.title = (data.title as string) || info.title;
      info.uploader = (data.artist as string) || info.uploader || 'Unknown';
    }

    const totalBytesSent = { value: 0 };
    setupConvertResponse(res, filename, format);

    // range/resume support
    const rangeHeader = (res.req?.headers?.range || '') as string;
    let rangeStart = 0;
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-/);
      if (match) rangeStart = parseInt(match[1], 10);
    }

    console.log(
      `[${timestamp}] [Turbo] Spawning stream download for: ${filename}`
    );
    const videoProcess = streamDownload(
      streamerUrl,
      {
        format,
        formatId: (targetFormat?.formatId || formatId || 'best') as string,
      },
      cookieArgs,
      info
    );

    // set Content-Length when size known
    let headersFlushed = false;
    const flushOnce = () => {
      if (headersFlushed) return;
      headersFlushed = true;
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
    };

    videoProcess.once('totalSize', (size: number) => {
      if (!res.headersSent) {
        if (rangeStart > 0 && size > rangeStart) {
          res.setHeader('Content-Range', `bytes ${rangeStart}-${size - 1}/${size}`);
          res.setHeader('Content-Length', size - rangeStart);
          res.status(206);
        } else {
          res.setHeader('Content-Length', size);
        }
      }
      flushOnce();
    });

    // flush immediately for download popup
    flushOnce();

    setupStreamListeners(videoProcess, res, clientId, totalBytesSent);

    const hardTimeoutId = setTimeout(
      () => {
        if (typeof videoProcess.kill === 'function') {
          console.error(
            `[${timestamp}] [Turbo] Hard timeout reached (30m) for stream: ${clientId}. Forcing SIGKILL.`
          );
          videoProcess.kill('SIGKILL');
        }
      },
      1000 * 60 * 30
    );

    return { videoProcess, hardTimeoutId };
  } catch (error: unknown) {
    const err = error as Error;
    recordFailure('convert');
    console.error('[ConvertVideo] Error:', err.message);
    Sentry.captureException(error);
    if (clientId)
      sendEvent(clientId, {
        status: 'error',
        message: err.message || 'Internal server error',
      });
    if (!res.headersSent)
      res.status(500).json({ error: err.message || 'Internal server error' });
    return null;
  }
}

export const convertVideo = (req: Request, res: Response): void => {
  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );

  const requestData = { ...req.query, ...req.body } as {
    url?: string;
    id?: string;
    format?: string;
    formatId?: string;
    token?: string;
    title?: string;
    artist?: string;
    targetUrl?: string;
  };

  const {
    url: videoURL,
    id: clientIdStr,
    format = 'mp4',
    formatId,
  } = requestData;
  const clientId = clientIdStr || undefined;

  console.log(`[Convert] Request received for: ${videoURL} (ID: ${clientId})`);

  if (!videoURL || !isSupportedUrl(videoURL)) {
    console.warn(`[Convert] Invalid URL: ${videoURL}`);
    res.status(400).json({ error: 'No valid URL provided' });
    return;
  }

  const token = requestData.token || clientId;
  if (token) {
    res.setHeader('Set-Cookie', `download_token=${token}; Path=/; Max-Age=60`);
  }

  const isSpotifyRequest = videoURL.includes('spotify.com');
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

  let finalFormat = format;
  if (formatId === 'photo') finalFormat = 'jpg';

  const filename = getSanitizedFilename(
    requestData.title || 'video',
    requestData.artist,
    finalFormat,
    isSpotifyRequest
  );

  console.log(
    `[${timestamp}] [Turbo] Starting Server-Side muxing for: ${filename}`
  );

  if (clientId) {
    sendEvent(clientId, {
      status: 'initializing',
      progress: 5,
      subStatus: 'syncing core...',
      text: 'initiating jump',
    });
  }

  (async () => {
    const result = await _executeDownload(
      res,
      clientId,
      videoURL as string,
      requestData,
      timestamp,
      filename,
      format,
      formatId,
      isSpotifyRequest
    );
    if (result) {
      const { videoProcess, hardTimeoutId } = result;
      req.on('close', () => {
        clearTimeout(hardTimeoutId);
        if (typeof videoProcess.kill === 'function') {
          console.log(
            `[${timestamp}] [Turbo] Client disconnected. Cleaning up stream for: ${clientId}`
          );
          videoProcess.kill();
        }
        if (!res.writableEnded) res.end();
      });
    }
  })().catch((error) => {
    console.error(
      `[${timestamp}] [ConvertVideo] Unhandled exception in download workflow:`,
      error
    );
    Sentry.captureException(error);
    if (!res.headersSent)
      res
        .status(500)
        .json({ error: 'Internal server error during processing' });
    if (!res.writableEnded) res.end();
  });
};

async function _resolveSeedTracks(url: string) {
  let tracks: unknown[] = [];
  try {
    tracks = await getTracks(url);
  } catch (error: unknown) {
    console.debug(
      '[VideoController] Track fetch error:',
      (error as Error).message
    );
  }

  if (!tracks || tracks.length === 0) {
    const data: unknown = await getData(url);
    if (typeof data === 'object' && data !== null && 'tracks' in data) {
      const tracksData = (data as { tracks: unknown }).tracks;
      if (Array.isArray(tracksData)) {
        tracks = tracksData;
      } else if (
        typeof tracksData === 'object' &&
        tracksData !== null &&
        'items' in tracksData &&
        Array.isArray(
          (tracksData as Record<string, unknown> & { items: unknown[] }).items
        )
      ) {
        tracks = (tracksData as Record<string, unknown> & { items: unknown[] })
          .items;
      }
    }
  }
  return tracks;
}

export const seedIntelligence = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { url, id: clientIdStr } = req.query as { url: string; id: string };
  const clientId = clientIdStr || 'admin-seeder';
  if (!url || !isValidSpotifyUrl(url)) {
    res
      .status(400)
      .json({ error: 'Invalid Spotify Artist/Album URL provided' });
    return;
  }

  try {
    const tracks = await _resolveSeedTracks(url);

    if (!tracks || tracks.length === 0) throw new Error('No tracks found.');

    res.json({
      message: 'Intelligence Gathering Started in Background',
      trackCount: tracks.length,
      target: url,
    });
    processBackgroundTracks(tracks as SeedTrack[], clientId).catch(
      (error: Error) => {
        console.error('[Seeder] Background Process Crashed:', error.message);
        Sentry.captureException(error);
      }
    );
  } catch (error: unknown) {
    if (!res.headersSent) {
      Sentry.captureException(error);
      res
        .status(500)
        .json({
          error: (error as Error).message || 'An unknown error occurred',
        });
    }
  }
};
