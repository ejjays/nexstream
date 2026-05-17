import { Request, Response } from 'express';
import { addClient, removeClient, sendEvent } from '../utils/sse.util.js';
import { saveToBrain } from '../services/spotify.service.js';
import { isSupportedUrl, isValidSpotifyUrl } from '../utils/validation.util.js';
import { pipeWebStream } from '../utils/proxy.util.js';
import { estimateFilesize } from '../utils/format.util.js';
import _spotifyUrlInfo from 'spotify-url-info';
const spotifyUrlInfo = _spotifyUrlInfo.default || _spotifyUrlInfo;
const { getTracks, getData } = spotifyUrlInfo(fetch);
import { getVideoInfo, streamDownload } from '../services/ytdlp.service.js';
import { detectService, getSanitizedFilename } from '../utils/video.util.js';
import { prepareFinalResponse, setupConvertResponse } from '../utils/response.util.js';
import {
  processBackgroundTracks,
  type SeedTrack
} from '../services/seeder.service.js';
import {
  isAvc,
  selectVideoFormat,
  selectAudioFormat,
  buildProxyUrl,
  getOutputMetadata,
  setupStreamListeners
} from '../utils/stream.util.js';
import {
  getCookieArgs,
  initializeSession,
  logExtractionSteps,
  resolveConvertTarget,
  resolveTargetFormat
} from '../utils/controller.util.js';
import { VideoInfo, SpotifyMetadata, Format } from '../types/index.js';

export const streamEvents = async (req: Request, res: Response): Promise<void> => {
  const id = (req.query.id as string) || undefined;
  console.log(`[SSE] Client connecting: ${id}`);
  if (!id) {
      res.status(400).end();
      return;
  }
  await addClient(id, res);
};

async function _fetchMediaInfo(videoURL: string, clientId: string | undefined, serviceName: string, cookieArgs: string[]): Promise<VideoInfo | null> {
  if (clientId) await logExtractionSteps(clientId, serviceName, 1);

  const info: VideoInfo | null = await getVideoInfo(videoURL, cookieArgs, false, null, clientId).catch((err: unknown) => {
    console.error(`[VideoInfo] Extraction failed:`, (err as Error).message);
    return null;
  });

  if (clientId) await logExtractionSteps(clientId, serviceName, 3);
  return info;
}

function _handleSpotifyRegistry(info: VideoInfo, finalResponse: any, videoURL: string, targetURL: string) {
  if (info.fromBrain || !info.is_js_info || !info.isIsrcMatch) return;

  console.log(`[Registry] Saving new mapping for: ${info.title} (ISRC: ${info.isrc})`);
  saveToBrain(videoURL, {
    ...info,
    cover: finalResponse.cover,
    formats: finalResponse.formats,
    audioFormats: finalResponse.audioFormats,
    targetUrl: targetURL
  } as unknown as SpotifyMetadata);
}

export const getVideoInformation = async (req: Request, res: Response): Promise<void> => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  let videoURL = req.query.url as string;
  const clientId = (req.query.id as string) || undefined;
  
  if (videoURL?.includes('%')) {
    try {
      const decoded = decodeURIComponent(videoURL);
      if (decoded.startsWith('http')) videoURL = decoded;
    } catch (e: unknown) {
      console.debug('[VideoController] URL decode error:', (e as Error).message);
    }
  }

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

    const info = await _fetchMediaInfo(videoURL, clientId, serviceName, cookieArgs);

    if (!info || !info.formats) {
      res.json({
        title: info?.title || 'Unknown',
        thumbnail: info?.thumbnail || '',
        formats: [],
        audioFormats: []
      });
      return;
    }

    const spotifyData = isSpotify ? (info as unknown as SpotifyMetadata) : null;
    const targetURL = isSpotify ? (info.target_url || info.targetUrl || videoURL) : videoURL;
    
    const finalResponse = await prepareFinalResponse(info, isSpotify, spotifyData, videoURL);
    if (isSpotify) {
        _handleSpotifyRegistry(info, finalResponse, videoURL, targetURL);
    }

    res.json(finalResponse);
  } catch (err: unknown) {
    console.error('[VideoInfo] Error:', (err as Error).message);
    if (clientId) removeClient(clientId);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to fetch video info' });
  }
};

function _resolveFormatDetails(info: VideoInfo, formatId: string, isSpotify: boolean) {
  const requestedFormat = info.formats.find(f => String(f.format_id) === String(formatId));
  const isAudioStream = (f: Format | undefined) => !f || !f.vcodec || f.vcodec === 'none';
  const isAudioOnly = formatId === 'mp3' || isSpotify || isAudioStream(requestedFormat);

  const finalVideoFormat = isAudioOnly ? null : selectVideoFormat(info.formats, formatId);
  const hasAudio = (f: Format | null) => f && f.acodec && f.acodec !== 'none';
  const needsWebm = Boolean(finalVideoFormat && !isAvc(finalVideoFormat));
  const finalAudioFormat = (isAudioOnly || !hasAudio(finalVideoFormat)) 
      ? selectAudioFormat(info.formats, formatId, isAudioOnly, needsWebm)
      : null;

  return { isAudioOnly, finalVideoFormat, finalAudioFormat, requestedFormat };
}

function _determineExtension(isAudioOnly: boolean, finalVideoFormat: Format | null, finalAudioFormat: Format | null, requestedFormat: Format | undefined, formatId: string) {
  let emeExtension = isAudioOnly ? finalAudioFormat?.extension || finalAudioFormat?.ext || 'mp3' : 'mp4';
  if (formatId === 'photo') {
    emeExtension = requestedFormat?.extension || requestedFormat?.ext || 'jpg';
  } else if (finalVideoFormat) {
    emeExtension = 'mp4';
  }
  return emeExtension;
}

export const getStreamUrls = async (req: Request, res: Response): Promise<void> => {
  const videoURLParam = req.query.url as string;
  const clientId = (req.query.id as string) || undefined;
  const formatId = req.query.formatId as string;
  
  let videoURL = videoURLParam;
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });

  if (videoURL?.includes('%')) {
    try {
      const decoded = decodeURIComponent(videoURL);
      if (decoded.startsWith('http')) videoURL = decoded;
    } catch (e: unknown) {
      console.debug('[VideoController] URL decode error:', (e as Error).message);
    }
  }

  if (videoURL) {
    videoURL = videoURL.split('&id=')[0].split('?id=')[0];
  }

  if (!videoURL || !isSupportedUrl(videoURL)) {
    res.status(400).json({ error: 'No valid URL provided' });
    return;
  }

  console.log(`[${timestamp}] [EME] Resolving manifests for Edge Muxing...`);

  try {
    const cookieArgs = await getCookieArgs(videoURL, clientId);
    const info: VideoInfo | null = await getVideoInfo(videoURL, cookieArgs, false, null, clientId).catch(() => null);

    if (!info) throw new Error('Failed to fetch media information.');

    const isSpotify = videoURL.includes('spotify.com');
    const resolvedTargetURL = isSpotify ? (info.target_url || info.targetUrl || videoURL) : videoURL;

    const { isAudioOnly, finalVideoFormat, finalAudioFormat, requestedFormat } = _resolveFormatDetails(info, formatId, isSpotify);

    const videoTunnel = buildProxyUrl(req, finalVideoFormat, resolvedTargetURL as string);
    const audioTunnel = buildProxyUrl(req, finalAudioFormat, resolvedTargetURL as string);

    const emeExtension = _determineExtension(isAudioOnly, finalVideoFormat, finalAudioFormat, requestedFormat, formatId);
    const filename = getSanitizedFilename(info.title, info.uploader, emeExtension, isSpotify);
    const outputMeta = getOutputMetadata(isAudioOnly, emeExtension, info);

    let totalSize = 0;
    try {
      totalSize = (estimateFilesize(finalVideoFormat || ({} as Format), info.duration || 0) || 0) + (estimateFilesize(finalAudioFormat || ({} as Format), info.duration || 0) || 0);
    } catch (e: unknown) {
      console.warn('[Size] Estimation failed:', (e as Error).message);
    }

    if (videoTunnel && audioTunnel && !isAudioOnly) {
      res.json({
        status: 'local-processing',
        type: 'proxy',
        tunnel: [videoTunnel, audioTunnel],
        output: { filename, totalSize, ...outputMeta },
        videoUrl: videoTunnel,
        audioUrl: audioTunnel,
        title: info.title,
        filename
      });
      return;
    }

    const tunnelPath = videoTunnel || audioTunnel;
    if (!tunnelPath || tunnelPath.includes('PENDING_DECIPHER')) {
       throw new Error('No valid proxy tunnel could be resolved or stream is encrypted.');
    }

    res.json({
      status: 'local-processing',
      type: 'proxy',
      tunnel: [tunnelPath],
      output: { filename, totalSize, ...outputMeta },
      videoUrl: isAudioOnly ? undefined : videoTunnel,
      audioUrl: audioTunnel,
      title: info.title,
      filename
    });

  } catch (err: unknown) {
    console.error('[StreamUrls] Error:', (err as Error).message);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to resolve stream URLs' });
  }
};

export const proxyStream = async (req: Request, res: Response): Promise<void> => {
  let { targetUrl, formatId, url: rawFallbackUrl, filename } = req.query as Record<string, string | string[] | undefined>;
  if (Array.isArray(targetUrl)) targetUrl = targetUrl[0];
  if (Array.isArray(formatId)) formatId = formatId[0];
  if (Array.isArray(rawFallbackUrl)) rawFallbackUrl = rawFallbackUrl[0];
  if (Array.isArray(filename)) filename = filename[0];

  const urlToFetch = rawFallbackUrl || (req.query.rawUrl as string);
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });

  if (urlToFetch) {
    try {
      await pipeWebStream(urlToFetch, res, filename, req.headers as unknown as Record<string, string | undefined>);
      return;
    } catch (err: unknown) {
      console.error(`[Proxy] Raw Pipe Error:`, (err as Error).message);
      if (!res.headersSent) res.status(500).json({ error: 'Proxy fetch failed' });
      res.end();
      return;
    }
  }

  if (targetUrl && formatId) {
      console.log(`[${timestamp}] [EME] Proxying stream via yt-dlp...`);
      const { spawn } = await import('child_process');
      const { USER_AGENT } = await import('../services/ytdlp/config.js');
      const { downloadCookies } = await import('../utils/cookie.util.js');
      
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      const cleanFormatId = formatId.split(/[-+]/)[0];
      const isWebm = req.query.ext === 'webm' || ['249', '250', '251', '271', '313'].includes(cleanFormatId);
      
      let mimeType = isWebm ? 'video/webm' : 'video/mp4';
      if (['249', '250', '251', '140'].includes(cleanFormatId)) {
          mimeType = isWebm ? 'audio/webm' : 'audio/mp4';
      }
      res.setHeader('Content-Type', mimeType);

      if (filename) {
          const safeName = encodeURIComponent(filename);
          res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeName}`);
      }

      const cookieType = detectService(targetUrl).toLowerCase();
      const cookiesPath = await downloadCookies(cookieType === 'facebook' || cookieType === 'instagram' ? 'facebook' : 'youtube');
      const cookieArgs = cookiesPath ? ['--cookies', cookiesPath] : [];

      const args = [
          ...cookieArgs,
          '--user-agent', USER_AGENT,
          '--no-warnings',
          '--ignore-config',
          '-f', cleanFormatId,
          '-o', '-',
          targetUrl
      ];

      const ytProcess = spawn('yt-dlp', args);
      ytProcess.stdout.pipe(res);
      ytProcess.on('close', () => { if (!res.writableEnded) res.end(); });
      req.on('close', () => { ytProcess.kill(); });
      return;
  }

  res.status(400).end();
};

export const reportTelemetry = async (req: Request, res: Response): Promise<void> => {
  const { event } = req.body;
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const safeEvent = String(event || 'unknown').replaceAll(/[^\w]/g, '_');
  console.log(`[${timestamp}] [EME] Client-Side Handshake: ${safeEvent}`);
  res.status(204).end();
};

async function _executeDownload(res: Response, clientId: string | undefined, videoURL: string, data: any, timestamp: string, filename: string, format: string, formatId: string | undefined, isSpotifyRequest: boolean) {
  try {
    const cookieArgs = await getCookieArgs(videoURL, clientId, 'initializing');
    const resolvedTargetURL = await resolveConvertTarget(videoURL, data.targetUrl, cookieArgs);

    console.log(`[${timestamp}] [Turbo] Resolved target for download: ${resolvedTargetURL}`);

    const { info, targetFormat } = await resolveTargetFormat(format, resolvedTargetURL, resolvedTargetURL, cookieArgs, formatId, clientId, videoURL);

    if (!info) {
      throw new Error('Failed to fetch media information.');
    }

    const streamerUrl = info.target_url || info.targetUrl || resolvedTargetURL;

    if (isSpotifyRequest) {
      info.title = data.title || info.title;
      info.uploader = data.artist || info.uploader || 'Unknown';
    }

    const totalBytesSent = { value: 0 };
    setupConvertResponse(res, filename, format);

    console.log(`[${timestamp}] [Turbo] Spawning stream download for: ${filename}`);
    const videoProcess = streamDownload(streamerUrl, { format, formatId: (targetFormat?.format_id || formatId || 'best') as string }, cookieArgs, info);
    setupStreamListeners(videoProcess, res, clientId, totalBytesSent);

    const hardTimeout = setTimeout(() => {
      if (typeof videoProcess.kill === 'function') {
        console.error(`[${timestamp}] [Turbo] Hard timeout reached (30m) for stream: ${clientId}. Forcing SIGKILL.`);
        videoProcess.kill('SIGKILL');
      }
    }, 1000 * 60 * 30);

    return { videoProcess, hardTimeout };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[ConvertVideo] Error:', err.message);
    if (clientId) sendEvent(clientId, { status: 'error', message: err.message || 'Internal server error' });
    if (!res.headersSent) res.status(500).json({ error: err.message || 'Internal server error' });
    return null;
  }
}

export const convertVideo = async (req: Request, res: Response): Promise<void> => {
  if (req.method === 'HEAD') {
      res.status(200).end();
      return;
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  
  const data = { ...req.query, ...req.body } as {
    url?: string;
    id?: string;
    format?: string;
    formatId?: string;
    token?: string;
    title?: string;
    artist?: string;
    targetUrl?: string;
  };

  const { url: videoURL, id: clientIdStr, format = 'mp4', formatId } = data;
  const clientId = clientIdStr || undefined;

  console.log(`[Convert] Request received for: ${videoURL} (ID: ${clientId})`);

  if (!videoURL || !isSupportedUrl(videoURL)) {
    console.warn(`[Convert] Invalid URL: ${videoURL}`);
    res.status(400).json({ error: 'No valid URL provided' });
    return;
  }

  const token = data.token || clientId;
  if (token) {
    res.setHeader('Set-Cookie', `download_token=${token}; Path=/; Max-Age=60`);
  }

  const isSpotifyRequest = videoURL.includes('spotify.com');
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });

  let finalFormat = format;
  if (formatId === 'photo') finalFormat = 'jpg';

  const filename = getSanitizedFilename(data.title || 'video', data.artist, finalFormat, isSpotifyRequest);

  console.log(`[${timestamp}] [Turbo] Starting Server-Side muxing for: ${filename}`);

  if (clientId) {
    sendEvent(clientId, {
      status: 'initializing',
      progress: 5,
      subStatus: 'syncing core...',
      text: 'initiating jump'
    });
  }

  (async () => {
      const result = await _executeDownload(res, clientId, videoURL as string, data, timestamp, filename, format, formatId, isSpotifyRequest);
      if (result) {
          const { videoProcess, hardTimeout } = result;
          req.on('close', () => {
            clearTimeout(hardTimeout);
            if (!res.writableEnded) {
              setTimeout(() => {
                if (!res.writableEnded && typeof videoProcess.kill === 'function') {
                  console.log(`[${timestamp}] [Turbo] Cleaning up inactive stream for: ${clientId}`);
                  videoProcess.kill('SIGKILL');
                }
              }, 3000);
            }
          });
      }
  })();
};

async function _resolveSeedTracks(url: string) {
  let tracks: unknown[] = [];
  try {
    tracks = await getTracks(url);
  } catch (e: unknown) {
    console.debug('[VideoController] Track fetch error:', (e as Error).message);
  }

  if (!tracks || tracks.length === 0) {
    const data: unknown = await getData(url);
    if (typeof data === 'object' && data !== null && 'tracks' in data) {
      const t = (data as { tracks: unknown }).tracks;
      if (Array.isArray(t)) {
        tracks = t;
      } else if (
        typeof t === 'object' &&
        t !== null &&
        'items' in t &&
        Array.isArray((t as Record<string, unknown> & { items: unknown[] }).items)
      ) {
        tracks = (t as Record<string, unknown> & { items: unknown[] }).items;
      }
    }
  }
  return tracks;
}

export const seedIntelligence = async (req: Request, res: Response): Promise<void> => {
  const { url, id: clientIdStr } = req.query as { url: string; id: string };
  const clientId = clientIdStr || 'admin-seeder';
  if (!url || !isValidSpotifyUrl(url)) {
    res.status(400).json({ error: 'Invalid Spotify Artist/Album URL provided' });
    return;
  }

  try {
    const tracks = await _resolveSeedTracks(url);

    if (!tracks || tracks.length === 0) throw new Error('No tracks found.');

    res.json({ message: 'Intelligence Gathering Started in Background', trackCount: tracks.length, target: url });
    processBackgroundTracks(tracks as SeedTrack[], clientId).catch((err: Error) => console.error('[Seeder] Background Process Crashed:', err.message));
  } catch (err: unknown) {
    if (!res.headersSent) {
      res.status(500).json({ error: (err as Error).message || 'An unknown error occurred' });
    }
  }
};
