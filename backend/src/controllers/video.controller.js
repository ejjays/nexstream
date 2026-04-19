const { addClient, removeClient, sendEvent } = require('../utils/sse.util');
const { resolveSpotifyToYoutube, saveToBrain } = require('../services/spotify.service');
const { isSupportedUrl, isValidSpotifyUrl, isValidProxyUrl } = require('../utils/validation.util');
const { pipeWebStream } = require('../utils/proxy.util');
const { estimateFilesize } = require('../utils/format.util');
const { getTracks, getData } = require('spotify-url-info')(fetch);
const { getVideoInfo, streamDownload, downloadImageToBuffer } = require('../services/ytdlp.service');
const { detectService, getSanitizedFilename } = require('../utils/video.util');
const { prepareFinalResponse, prepareBrainResponse, setupConvertResponse } = require('../utils/response.util');
const { processBackgroundTracks } = require('../services/seeder.service');
const {
  isAvc,
  selectVideoFormat,
  selectAudioFormat,
  buildProxyUrl,
  getOutputMetadata,
  setupStreamListeners
} = require('../utils/stream.util');
const {
  getCookieArgs,
  initializeSession,
  logExtractionSteps,
  handleBrainHit,
  resolveConvertTarget,
  resolveAudioFormatIfMp3
} = require('../utils/controller.util');

exports.streamEvents = async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).end();
  await addClient(id, res);
};

exports.getVideoInformation = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  let videoURL = req.query.url;
  const clientId = req.query.id;

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
  const isYouTube = videoURL.includes('youtube.com') || videoURL.includes('youtu.be');

  try {
    let targetURL = videoURL;
    let spotifyData = null;
    let info = null;
    let cookieArgs = [];

    // fast path
    if (isYouTube && !isSpotify) {
      info = await getVideoInfo(videoURL, [], false, null, clientId).catch(() => null);
      if (info && clientId) {
        sendEvent(clientId, {
          status: 'fetching_info',
          progress: 50,
          subStatus: 'using fast path',
          details: 'bypass locked'
        });
      }
    }

    if (isSpotify) {
      cookieArgs = await cookieArgsPromise;
      spotifyData = await resolveSpotifyToYoutube(
        videoURL,
        cookieArgs,
        (status, progress, extraData) => {
          if (clientId) sendEvent(clientId, { status, progress, ...extraData });
        }
      );
      targetURL = spotifyData.targetUrl;

      if (spotifyData.fromBrain) {
        handleBrainHit(videoURL, targetURL, spotifyData, cookieArgs, clientId);
        return res.json(prepareBrainResponse(spotifyData));
      }
    } else if (!info) {
      await logExtractionSteps(clientId, serviceName);
    }

    if (!info) {
      if (clientId) {
        sendEvent(clientId, {
          status: 'fetching_info',
          progress: 85,
          subStatus: 'resolving data...'
        });
      }

      cookieArgs = await cookieArgsPromise;
      info = await getVideoInfo(targetURL, cookieArgs, false, null, clientId).catch(() => null);
      
      if (!info && cookieArgs && cookieArgs.length > 0) {
        console.warn(`[VideoInfo] yt-dlp failed with cookies. Retrying without...`);
        info = await getVideoInfo(targetURL, [], false, null, clientId).catch(() => null);
        if (info) cookieArgs.length = 0;
      }
    }

    if (!info || !info.formats) {
      return res.json({
        title: info?.title || 'Unknown',
        thumbnail: info?.thumbnail || '',
        formats: [],
        audioFormats: []
      });
    }

    const finalResponse = await prepareFinalResponse(info, isSpotify, spotifyData, videoURL);

    if (isSpotify && !spotifyData.fromBrain && spotifyData.isIsrcMatch) {
      saveToBrain(videoURL, {
        ...spotifyData,
        cover: finalResponse.cover,
        formats: finalResponse.formats,
        audioFormats: finalResponse.audioFormats,
        targetUrl: targetURL
      });
    }

    res.json(finalResponse);
    if (clientId) {
      setTimeout(() => removeClient(clientId), 2000);
    }
  } catch (err) {
    console.error('[VideoInfo] Error:', err.message);
    if (clientId) removeClient(clientId);
    res.status(500).json({ error: 'Failed to fetch video info' });
  }
};

exports.getStreamUrls = async (req, res) => {
  let { url: videoURL, id: clientId, formatId } = req.query;
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
    const resolvedTargetURL = await resolveConvertTarget(videoURL, req.query.targetUrl, cookieArgs);

    let info = null;
    if (resolvedTargetURL.includes('youtube.com') || resolvedTargetURL.includes('youtu.be')) {
      info = await getVideoInfo(resolvedTargetURL, [], false, null, clientId).catch(() => null);
    }

    if (!info) {
      info = await getVideoInfo(resolvedTargetURL, cookieArgs, false, null, clientId).catch(() => null);
      if (!info && cookieArgs && cookieArgs.length > 0) {
        console.warn(`[getStreamUrls] yt-dlp failed with cookies. Retrying without cookies...`);
        info = await getVideoInfo(resolvedTargetURL, [], false, null, clientId).catch(() => null);
      }
    }

    if (!info) throw new Error('Failed to fetch media information.');

    const requestedFormat = info.formats.find(f => String(f.format_id) === String(formatId));
    const isAudioStream = f => !f || !f.vcodec || f.vcodec === 'none';
    const isAudioOnly = formatId === 'mp3' || videoURL.includes('spotify.com') || isAudioStream(requestedFormat);

    const finalVideoFormat = isAudioOnly ? null : selectVideoFormat(info.formats, formatId);
    const hasAudio = f => f && f.acodec && f.acodec !== 'none';
    const needsWebm = finalVideoFormat && !isAvc(finalVideoFormat);
    const finalAudioFormat = (isAudioOnly || !hasAudio(finalVideoFormat)) 
        ? selectAudioFormat(info.formats, formatId, isAudioOnly, needsWebm)
        : null;

    const videoTunnel = buildProxyUrl(req, finalVideoFormat, resolvedTargetURL);
    const audioTunnel = buildProxyUrl(req, finalAudioFormat, resolvedTargetURL);

    let emeExtension = isAudioOnly ? finalAudioFormat?.ext || 'mp3' : 'mp4';
    if (finalVideoFormat) emeExtension = 'mp4';

    const filename = getSanitizedFilename(info.title, info.uploader, emeExtension, videoURL.includes('spotify.com'));
    const outputMeta = getOutputMetadata(isAudioOnly, emeExtension, info);

    let totalSize = 0;
    try {
      totalSize = (estimateFilesize(finalVideoFormat || {}, info.duration) || 0) + (estimateFilesize(finalAudioFormat || {}, info.duration) || 0);
    } catch (e) {
      console.warn('[Size] Estimation failed:', e.message);
    }

    if (videoTunnel && audioTunnel) {
      const host = req.get('host');
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
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

  } catch (err) {
    console.error('[StreamUrls] Error:', err.message);
    res.status(500).json({ error: 'Failed to resolve stream URLs' });
  }
};

exports.proxyStream = async (req, res) => {
  let { targetUrl, formatId, url: rawFallbackUrl, filename } = req.query;
  if (Array.isArray(targetUrl)) targetUrl = targetUrl[0];
  if (Array.isArray(formatId)) formatId = formatId[0];
  if (Array.isArray(rawFallbackUrl)) rawFallbackUrl = rawFallbackUrl[0];
  if (Array.isArray(filename)) filename = filename[0];

  const urlToFetch = rawFallbackUrl || req.query.rawUrl;
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });

  if (urlToFetch) {
    try {
      return await pipeWebStream(urlToFetch, res, filename, req.headers);
    } catch (err) {
      console.error(`[Proxy] Raw Pipe Error:`, err.message);
      if (!res.headersSent) return res.status(500).json({ error: 'Proxy fetch failed' });
    }
  }

  if (targetUrl && formatId) {
      console.log(`[${timestamp}] [EME] Proxying stream via yt-dlp...`);
      const { spawn } = require('child_process');
      const { USER_AGENT } = require('../services/ytdlp/config');
      const { downloadCookies } = require('../utils/cookie.util');
      
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

      const { getCookieType } = require('../utils/video.util');
      const cookieType = getCookieType(targetUrl);
      const cookiesPath = cookieType ? await downloadCookies(cookieType) : null;
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

exports.reportTelemetry = async (req, res) => {
  const { event } = req.body;
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const safeEvent = String(event || 'unknown').replaceAll(/[^\w]/g, '_');
  console.log(`[${timestamp}] [EME] Client-Side Handshake: ${safeEvent}`);
  res.status(204).end();
};

exports.convertVideo = async (req, res) => {
  if (req.method === 'HEAD') return res.status(200).end();
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  const data = { ...req.query, ...req.body };
  let { url: videoURL, id: clientId = Date.now().toString(), format = 'mp4', formatId } = data;

  if (!videoURL || !isSupportedUrl(videoURL)) return res.status(400).json({ error: 'No valid URL provided' });

  const token = data.token || clientId;
  if (token) {
    res.setHeader('Set-Cookie', `download_token=${token}; Path=/; Max-Age=60`);
  }

  const isSpotifyRequest = videoURL.includes('spotify.com');
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const filename = getSanitizedFilename(data.title || 'video', data.artist, format, isSpotifyRequest);

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

      const { info } = await resolveAudioFormatIfMp3(format, resolvedTargetURL, resolvedTargetURL, cookieArgs, formatId, clientId);

      if (!info || !info.formats) {
        throw new Error('Failed to fetch media information.');
      }

      const totalBytesSent = { value: 0 };
      setupConvertResponse(res, filename, format);

      console.log(`[${timestamp}] [Turbo] Spawning stream download for: ${filename}`);
      const videoProcess = streamDownload(resolvedTargetURL, { format, formatId }, cookieArgs, info);
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

    } catch (error) {
      console.error('[ConvertVideo] Error:', error.message);
      if (clientId) sendEvent(clientId, { status: 'error', message: error.message || 'Internal server error' });
      if (!res.headersSent) res.status(500).json({ error: error.message || 'Internal server error' });
    }
  })();
};

exports.seedIntelligence = async (req, res) => {
  const { url, id: clientId = 'admin-seeder' } = req.query;
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
    processBackgroundTracks(tracks, clientId).catch(err => console.error('[Seeder] Background Process Crashed:', err.message));
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
};
