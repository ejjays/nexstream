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
import { processBackgroundTracks } from '../services/seeder.service.js';
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
  resolveAudioFormatIfMp3
} from '../utils/controller.util.js';
import { VideoInfo, SpotifyMetadata } from '../types/index.js';

export const streamEvents = async (req: Request, res: Response) => {
  const { id } = req.query;
  console.log(`[SSE] Client connecting: ${id}`);
  if (!id) return res.status(400).end();
  await addClient(id as string, res);
};

export const getVideoInformation = async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  let videoURL = req.query.url as string;
  const clientId = req.query.id as string;
  
  console.log(`[Server] Incoming request for: ${videoURL}`);

  if (videoURL && videoURL.includes('%')) {
    try {
      const decoded = decodeURIComponent(videoURL);
      if (decoded.startsWith('http')) videoURL = decoded;
    } catch (e) {}
  }

  if (videoURL) {
    videoURL = videoURL.split('&id=')[0].split('?id=')[0];
  }

  if (!videoURL || !isSupportedUrl(videoURL)) return res.status(400).json({ error: 'No valid URL provided' });

  const serviceName = detectService(videoURL);
  await initializeSession(clientId);

  const cookieArgsPromise = getCookieArgs(videoURL, clientId);
  const isSpotify = videoURL.includes('spotify.com');

  try {
    let info: VideoInfo | null = null;
    let cookieArgs = await cookieArgsPromise;

    if (clientId) await logExtractionSteps(clientId, serviceName, 1);

    // try js path
    info = await getVideoInfo(videoURL, cookieArgs, false, null, clientId).catch((err: unknown) => {
        const error = err as Error;
        console.error(`[VideoInfo] Extraction failed:`, error.message);
        return null;
    });

    if (clientId) await logExtractionSteps(clientId, serviceName, 3);

    if (!info || !info.formats) {
      return res.json({
        title: info?.title || 'Unknown',
        thumbnail: info?.thumbnail || '',
        formats: [],
        audioFormats: []
      });
    }

    // merge spotify visuals
    const spotifyData = isSpotify ? (info as unknown as SpotifyMetadata) : null;
    const targetURL = isSpotify ? (info.target_url || info.targetUrl) : videoURL;
    
    const finalResponse = await prepareFinalResponse(info, isSpotify, spotifyData, videoURL);

    // verify isrc match
    if (isSpotify && !info.fromBrain && info.is_js_info && info.isIsrcMatch) {
      console.log(`[Registry] Saving new mapping for: ${info.title} (ISRC: ${info.isrc})`);
      saveToBrain(videoURL, {
        ...info,
        cover: finalResponse.cover,
        formats: finalResponse.formats,
        audioFormats: finalResponse.audioFormats,
        targetUrl: targetURL
      } as unknown as SpotifyMetadata);
    }

    res.json(finalResponse);
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[VideoInfo] Error:', error.message);
    if (clientId) removeClient(clientId);
    res.status(500).json({ error: 'Failed to fetch video info' });
  }
};

export const getStreamUrls = async (req: Request, res: Response) => {
  let { url: videoURL, id: clientId, formatId } = req.query as { url: string, id: string, formatId: string };
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });

  if (videoURL && videoURL.includes('%')) {
    try {
      const decoded = decodeURIComponent(videoURL);
      if (decoded.startsWith('http')) videoURL = decoded;
    } catch (e) {}
  }

  if (videoURL) {
    videoURL = videoURL.split('&id=')[0].split('?id=')[0];
  }

  if (!videoURL || !isSupportedUrl(videoURL)) return res.status(400).json({ error: 'No valid URL provided' });

  console.log(`[${timestamp}] [EME] Resolving manifests for Edge Muxing...`);

  try {
    const cookieArgs = await getCookieArgs(videoURL, clientId);
    
    let info: VideoInfo | null = await getVideoInfo(videoURL, cookieArgs, false, null, clientId).catch(() => null);

    if (!info) throw new Error('Failed to fetch media information.');

    const isSpotify = videoURL.includes('spotify.com');
    const resolvedTargetURL = isSpotify ? (info.target_url || info.targetUrl) : videoURL;

    const requestedFormat = info.formats.find(f => String(f.format_id) === String(formatId));
    const isAudioStream = (f: Format | undefined) => !f || !f.vcodec || f.vcodec === 'none';
    const isAudioOnly = formatId === 'mp3' || isSpotify || isAudioStream(requestedFormat);

    const finalVideoFormat = isAudioOnly ? null : selectVideoFormat(info.formats, formatId);
    const hasAudio = (f: Format | null) => f && f.acodec && f.acodec !== 'none';
    const needsWebm = finalVideoFormat && !isAvc(finalVideoFormat);
    const finalAudioFormat = (isAudioOnly || !hasAudio(finalVideoFormat)) 
        ? selectAudioFormat(info.formats, formatId, isAudioOnly, needsWebm)
        : null;

    const videoTunnel = buildProxyUrl(req, finalVideoFormat, resolvedTargetURL as string);
    const audioTunnel = buildProxyUrl(req, finalAudioFormat, resolvedTargetURL as string);

    let emeExtension = isAudioOnly ? finalAudioFormat?.extension || finalAudioFormat?.ext || 'mp3' : 'mp4';
    if (formatId === 'photo') {
        emeExtension = requestedFormat?.extension || requestedFormat?.ext || 'jpg';
    } else if (finalVideoFormat) {
        emeExtension = 'mp4';
    }

    const filename = getSanitizedFilename(info.title, info.uploader, emeExtension, isSpotify);
    const outputMeta = getOutputMetadata(isAudioOnly, emeExtension, info);

    let totalSize = 0;
    try {
      totalSize = (estimateFilesize(finalVideoFormat || {}, info.duration) || 0) + (estimateFilesize(finalAudioFormat || {}, info.duration) || 0);
    } catch (e: unknown) {
      const error = e as Error;
      console.warn('[Size] Estimation failed:', error.message);
    }

    if (videoTunnel && audioTunnel) {
      const host = req.get('host');
      const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
      const mergeUrl = `${protocol}://${host}/convert?url=${encodeURIComponent(videoURL)}&formatId=${formatId}&targetUrl=${encodeURIComponent(resolvedTargetURL)}&id=${clientId}&title=${encodeURIComponent(info.title)}&artist=${encodeURIComponent(info.uploader)}&format=${emeExtension}`;
      return res.json({
        status: 'local-processing',
        type: 'proxy',
        tunnel: [mergeUrl],
        output: { filename, totalSize, ...outputMeta },
        videoUrl: mergeUrl,
        title: info.title,
        filename
      });
    }

    res.json({
      status: 'local-processing',
      type: 'proxy',
      tunnel: [videoTunnel || audioTunnel].filter(Boolean),
      output: { filename, totalSize, ...outputMeta },
      videoUrl: videoTunnel,
      audioUrl: audioTunnel,
      title: info.title,
      filename
    });

  } catch (err: unknown) {
    const error = err as Error;
    console.error('[StreamUrls] Error:', error.message);
    res.status(500).json({ error: 'Failed to resolve stream URLs' });
  }
};

export const proxyStream = async (req: Request, res: Response) => {
  let { targetUrl, formatId, url: rawFallbackUrl, filename } = req.query as Record<string, string | string[] | undefined>;
  if (Array.isArray(targetUrl)) targetUrl = targetUrl[0];
  if (Array.isArray(formatId)) formatId = formatId[0];
  if (Array.isArray(rawFallbackUrl)) rawFallbackUrl = rawFallbackUrl[0];
  if (Array.isArray(filename)) filename = filename[0];

  const urlToFetch = rawFallbackUrl || (req.query.rawUrl as string);
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });

  if (urlToFetch) {
    try {
      return await pipeWebStream(urlToFetch, res, filename, req.headers);
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`[Proxy] Raw Pipe Error:`, error.message);
      if (!res.headersSent) return res.status(500).json({ error: 'Proxy fetch failed' });
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

      const cookieType = detectService(targetUrl).toLowerCase(); // simplified
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
      req.on('close', () => ytProcess.kill());
      return;
  }

  res.status(400).end();
};

export const reportTelemetry = async (req: Request, res: Response) => {
  const { event } = req.body;
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const safeEvent = String(event || 'unknown').replaceAll(/[^\w]/g, '_');
  console.log(`[${timestamp}] [EME] Client-Side Handshake: ${safeEvent}`);
  res.status(204).end();
};

export const convertVideo = async (req: Request, res: Response) => {
  if (req.method === 'HEAD') return res.status(200).end();
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

  let { url: videoURL, id: clientId = Date.now().toString(), format = 'mp4', formatId } = data;

  console.log(`[Convert] Request received for: ${videoURL} (ID: ${clientId})`);

  if (!videoURL || !isSupportedUrl(videoURL)) {
    console.warn(`[Convert] Invalid URL: ${videoURL}`);
    return res.status(400).json({ error: 'No valid URL provided' });
  }


  const token = data.token || clientId;
  if (token) {
    res.setHeader('Set-Cookie', `download_token=${token}; Path=/; Max-Age=60`);
  }

  const isSpotifyRequest = videoURL.includes('spotify.com');
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });

  // force correct extension for photos
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
    try {
      const cookieArgs = await getCookieArgs(videoURL, clientId, 'initializing');
      const resolvedTargetURL = await resolveConvertTarget(videoURL, data.targetUrl, cookieArgs);

      console.log(`[${timestamp}] [Turbo] Resolved target for download: ${resolvedTargetURL}`);

      const { info, audioFormat } = await resolveAudioFormatIfMp3(format, resolvedTargetURL, resolvedTargetURL, cookieArgs, formatId, clientId, videoURL);

      if (!info) {
        throw new Error('Failed to fetch media information.');
      }

      const streamerUrl = info.target_url || info.targetUrl || resolvedTargetURL;

      // merge spotify metadata
      if (isSpotifyRequest) {
        info.title = data.title || info.title;
        info.uploader = data.artist || info.uploader || data.artist;
      }

      const totalBytesSent = { value: 0 };
      setupConvertResponse(res, filename, format);

      console.log(`[${timestamp}] [Turbo] Spawning stream download for: ${filename}`);
      const videoProcess = streamDownload(streamerUrl, { format, formatId: audioFormat?.format_id || formatId }, cookieArgs, info);
      setupStreamListeners(videoProcess, res, clientId, totalBytesSent);

      req.on('close', () => {
        if (!res.writableEnded) {
          setTimeout(() => {
            if (!res.writableEnded && typeof videoProcess.kill === 'function') {
              console.log(`[${timestamp}] [Turbo] Cleaning up inactive stream for: ${clientId}`);
              videoProcess.kill();
            }
          }, 3000);
        }
      });

    } catch (error: unknown) {
      const err = error as Error;
      console.error('[ConvertVideo] Error:', err.message);
      if (clientId) sendEvent(clientId, { status: 'error', message: err.message || 'Internal server error' });
      if (!res.headersSent) res.status(500).json({ error: err.message || 'Internal server error' });
    }
  })();
};

export const seedIntelligence = async (req: Request, res: Response) => {
  const { url, id: clientId = 'admin-seeder' } = req.query as { url: string, id: string };
  if (!url || !isValidSpotifyUrl(url)) return res.status(400).json({ error: 'Invalid Spotify Artist/Album URL provided' });

  try {
    let tracks = [];
    try {
      tracks = await getTracks(url);
    } catch (e) {}

    if (!tracks || tracks.length === 0) {
      const data = await getData(url);
      if (data && data.tracks) {
        tracks = Array.isArray(data.tracks) ? data.tracks : data.tracks.items || [];
      }
    }

    if (!tracks || tracks.length === 0) throw new Error('No tracks found.');

    res.json({ message: 'Intelligence Gathering Started in Background', trackCount: tracks.length, target: url });
    processBackgroundTracks(tracks, clientId).catch((err: Error) => console.error('[Seeder] Background Process Crashed:', err.message));
  } catch (err: unknown) {
    const error = err as Error;
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
};
