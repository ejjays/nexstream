const { addClient, removeClient, sendEvent } = require('../utils/sse.util');
const { resolveSpotifyToYoutube, saveToBrain } = require('../services/spotify.service');
const { isSupportedUrl, isValidSpotifyUrl, isValidProxyUrl } = require('../utils/validation.util');
const { pipeWebStream } = require('../utils/proxy.util');
const { estimateFilesize } = require('../utils/format.util');
const { getTracks, getData } = require('spotify-url-info')(fetch);
const { getVideoInfo, streamDownload } = require('../services/ytdlp.service');
const { detectService, getCookieType, getSanitizedFilename } = require('../utils/video.util');
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

exports.streamEvents = (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).end();
  addClient(id, res);
  req.on('close', () => removeClient(id));
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

  // strip stream ids
  if (videoURL) {
    videoURL = videoURL.split('&id=')[0].split('?id=')[0];
  }

  if (!videoURL || !isSupportedUrl(videoURL)) return res.status(400).json({ error: 'No valid URL provided' });

  const serviceName = detectService(videoURL);
  await initializeSession(clientId);

  const cookieArgs = await getCookieArgs(videoURL, clientId);
  const isSpotify = videoURL.includes('spotify.com');

  try {
    let targetURL = videoURL;
    let spotifyData = null;

    if (isSpotify) {
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
    } else {
      await logExtractionSteps(clientId, serviceName);
    }

    if (clientId) {
      sendEvent(clientId, {
        status: 'fetching_info',
        progress: 85,
        subStatus: 'Resolving Target Data...'
      });
    }

    let info = await getVideoInfo(targetURL, cookieArgs).catch(() => null);
    if (!info && cookieArgs && cookieArgs.length > 0) {
      console.warn(`[VideoInfo] yt-dlp failed with cookies for ${targetURL}. Retrying without cookies...`);
      info = await getVideoInfo(targetURL, []).catch(() => null);
      if (info) cookieArgs.length = 0;
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
  } catch (err) {
    console.error('[VideoInfo] Error:', err.message);
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
    let info = await getVideoInfo(resolvedTargetURL, cookieArgs).catch(() => null);
    if (!info && cookieArgs && cookieArgs.length > 0) {
      console.warn(`[getStreamUrls] yt-dlp failed with cookies. Retrying without cookies...`);
      info = await getVideoInfo(resolvedTargetURL, []).catch(() => null);
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
    // force mp4 container
    if (finalVideoFormat) emeExtension = 'mp4';

    const filename = getSanitizedFilename(info.title, info.uploader, emeExtension, videoURL.includes('spotify.com'));

    const outputMeta = getOutputMetadata(isAudioOnly, emeExtension, info);
    const totalSize = (estimateFilesize(finalVideoFormat || {}, info.duration) || 0) + (estimateFilesize(finalAudioFormat || {}, info.duration) || 0);

    // server side merge
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

    if (isAudioOnly && audioTunnel) {
      const finalAudioTunnel = audioTunnel + `&filename=${encodeURIComponent(filename)}&targetUrl=${encodeURIComponent(resolvedTargetURL)}&formatId=${formatId}`;
      return res.json({
        status: 'local-processing',
        type: 'proxy',
        tunnel: [finalAudioTunnel],
        output: { filename, totalSize, ...outputMeta },
        videoUrl: videoTunnel,
        audioUrl: finalAudioTunnel,
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
  const { targetUrl, formatId, url: rawFallbackUrl, filename } = req.query;
  const urlToFetch = rawFallbackUrl || req.query.rawUrl;
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });

  // use raw url
  if (urlToFetch) {
    try {
      return await pipeWebStream(urlToFetch, res, filename, req.headers);
    } catch (err) {
      console.error(`[Proxy] Raw Pipe Error:`, err.message);
      // fallback to ytdlp
      if (!targetUrl || !formatId) return res.status(500).json({ error: 'Proxy fetch failed' });
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

      const cookieType = getCookieType(targetUrl);
      const cookiesPath = cookieType ? await downloadCookies(cookieType) : null;
      const cookieArgs = cookiesPath ? ['--cookies', cookiesPath] : [];

      const args = [
          ...cookieArgs,
          '--user-agent', USER_AGENT,
          '--no-warnings',
          '--ignore-config',
          '-f', cleanFormatId,
          '--downloader', 'ffmpeg',
          '--downloader-args', isWebm
            ? `ffmpeg:-f matroska -live 1`
            : `ffmpeg:-movflags +frag_keyframe+empty_moov+default_base_moof -f mp4`,
          '-o', '-',
          targetUrl
      ];

      const ytProcess = spawn('yt-dlp', args);
      ytProcess.stderr.on('data', () => {});
      ytProcess.stdout.pipe(res);

      req.on('close', () => ytProcess.kill());

      ytProcess.on('error', (err) => {
          console.error('[Proxy] yt-dlp engine error:', err);
          if (!res.headersSent) res.status(500).end();
      });
      return;
  }

  if (!urlToFetch) return res.status(400).end();

  if (!isValidProxyUrl(urlToFetch)) {
    console.warn('[Proxy] Blocked untrusted URL');
    return res.status(403).json({ error: 'Untrusted domain' });
  }

  try {
    await pipeWebStream(urlToFetch, res, filename, req.headers);
  } catch (err) {
    console.error(`[Proxy] Engine Error:`, err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Internal Proxy Error' });
  }
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

  if (req.method === 'GET' && data.imageUrl && data.imageUrl.length > 2000) {
    data.imageUrl = '';
  }

  const { url: videoURL, id: clientId = Date.now().toString(), format = 'mp4', formatId } = data;
  if (!videoURL || !isSupportedUrl(videoURL)) return res.status(400).json({ error: 'No valid URL provided' });

  const isSpotifyRequest = videoURL.includes('spotify.com');
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const filename = getSanitizedFilename(data.title || 'video', data.artist, format, isSpotifyRequest);

  console.log(`[${timestamp}] [Turbo] Starting Server-Side muxing...`);

  if (clientId) {
    sendEvent(clientId, {
      status: 'initializing',
      progress: 5,
      subStatus: 'Initializing Engine...',
      details: 'MUXER: PREPARING_VIRTUAL_CONTAINER'
    });
  }

  (async () => {
    try {
      const cookieArgs = await getCookieArgs(videoURL, clientId);
      const resolvedTargetURL = await resolveConvertTarget(videoURL, data.targetUrl, cookieArgs);

      const { info, streamURL: finalStreamURL } = await resolveAudioFormatIfMp3(
        format,
        resolvedTargetURL,
        resolvedTargetURL,
        cookieArgs,
        formatId
      );

      if (!info || !info.formats) {
        throw new Error('Failed to fetch media information. The link may be private or restricted.');
      }

      const isAudioStream = f => !f || !f.vcodec || f.vcodec === 'none';
      const requestedFormat = info.formats.find(f => String(f.format_id) === String(formatId));
      const isAudioOnly = format === 'mp3' || videoURL.includes('spotify.com') || isAudioStream(requestedFormat);

      let totalSize = 0;
      if (format !== 'mp3') {
        const vF = isAudioOnly ? null : selectVideoFormat(info.formats, formatId);
        const needsWebm = vF && !isAvc(vF);
        const aF = selectAudioFormat(info.formats, formatId, isAudioOnly, needsWebm);
        totalSize = (estimateFilesize(vF || {}, info.duration) || 0) + (estimateFilesize(aF || {}, info.duration) || 0);
      }

      setupConvertResponse(res, filename, format, totalSize);

      const videoProcess = streamDownload(resolvedTargetURL, { format, formatId }, cookieArgs, info);
      const totalBytesSent = { value: 0 };
      
      setupStreamListeners(videoProcess, res, clientId, totalBytesSent);

      req.on('close', () => {
        if (videoProcess.exitCode === null) videoProcess.kill();
      });

      videoProcess.on('close', code => {
        if (code !== 0 && totalBytesSent.value > 0 && clientId) {
          sendEvent(clientId, { status: 'error', message: 'Stream interrupted' });
        }
        res.end();
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

    if (!tracks || tracks.length === 0) throw new Error('No tracks found. Ensure it is a valid Spotify Track, Album, or Artist URL.');

    res.json({ message: 'Intelligence Gathering Started in Background', trackCount: tracks.length, target: url });
    processBackgroundTracks(tracks, clientId).catch(err => console.error('[Seeder] Background Process Crashed:', err.message));
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
};
