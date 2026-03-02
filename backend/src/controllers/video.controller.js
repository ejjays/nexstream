const { downloadCookies } = require('../utils/cookie.util');
const { addClient, removeClient, sendEvent } = require('../utils/sse.util');
const {
  resolveSpotifyToYoutube,
  saveToBrain
} = require('../services/spotify.service');
const {
  isSupportedUrl,
  isValidSpotifyUrl,
  isValidProxyUrl
} = require('../utils/validation.util');
const { getProxyHeaders, pipeWebStream } = require('../utils/proxy.util');
const { estimateFilesize } = require('../utils/format.util');

async function resolveAudioFormatIfMp3(format, streamURL, resolvedTargetURL, cookieArgs, formatId) {
  if (
    format === 'mp3' &&
    (streamURL.includes('youtube.com/watch') || streamURL.includes('youtu.be'))
  ) {
    const info = await getVideoInfo(resolvedTargetURL, cookieArgs);
    const audioFormat =
      info.formats.find(f => String(f.format_id) === String(formatId)) ||
      info.formats
        .filter(f => f.acodec !== 'none')
        .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
    return { info, streamURL: audioFormat ? audioFormat.url : streamURL };
  }
  const info = await getVideoInfo(resolvedTargetURL, cookieArgs).catch(() => null);
  return { info, streamURL };
}

function setupStreamListeners(videoProcess, res, clientId, totalBytesSent) {
  videoProcess.stdout.on('data', chunk => {
    if (totalBytesSent.value === 0) {
      if (clientId)
        sendEvent(clientId, {
          status: 'downloading',
          progress: 100,
          subStatus: 'STREAM ESTABLISHED: Check Downloads'
        });
    }
    totalBytesSent.value += chunk.length;
  });

  videoProcess.stdout.pipe(res);

  videoProcess.stdout.on('error', err => {
    console.error('[Convert] Stream Error:', err.message);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Stream generation failed' });
    } else {
        res.end();
    }
  });
}
const { getTracks, getData } = require('spotify-url-info')(fetch);
const { getVideoInfo, streamDownload } = require('../services/ytdlp.service');
const {
  getBestThumbnail,
  proxyThumbnailIfNeeded
} = require('../services/social.service');
const {
  detectService,
  getCookieType,
  getSanitizedFilename
} = require('../utils/video.util');
const {
  prepareFinalResponse,
  prepareBrainResponse,
  setupConvertResponse
} = require('../utils/response.util');
const { processBackgroundTracks } = require('../services/seeder.service');

const isDirect = f =>
  f.url &&
  f.protocol &&
  !f.protocol.includes('m3u8') &&
  !f.protocol.includes('manifest') &&
  !f.url.includes('.m3u8');

const isAvc = f => {
  if (!f) return false;
  const vcodec = f.vcodec || '';
  return vcodec.startsWith('avc1') || vcodec.startsWith('h264');
};

function selectVideoFormat(formats, formatId) {
  const available = formats
    .filter(
      f =>
        f.vcodec !== 'none' &&
        isDirect(f) &&
        f.ext === 'mp4' &&
        f.vcodec.startsWith('avc1') &&
        f.height <= 1080
    )
    .sort((a, b) => b.height - a.height);

  const selected = available[0];
  const requested = formats.find(
    f =>
      String(f.format_id) === String(formatId) &&
      isDirect(f) &&
      f.vcodec !== 'none'
  );
  return requested || selected;
}

function selectAudioFormat(formats, formatId, isAudioOnly, needsWebm) {
  const available = formats.filter(f => f.acodec !== 'none' && isDirect(f));
  const m4aAudio = available
    .filter(f => f.ext === 'm4a')
    .sort((a, b) => b.abr - a.abr)[0];
  const webmAudio = available
    .filter(f => f.ext === 'webm' || f.acodec === 'opus')
    .sort((a, b) => b.abr - a.abr)[0];

  const requested =
    isAudioOnly && formats.find(f => String(f.format_id) === String(formatId))
      ? formats.find(f => String(f.format_id) === String(formatId))
      : null;

  return requested || (needsWebm && webmAudio ? webmAudio : m4aAudio || webmAudio);
}

function buildProxyUrl(req, format, targetUrl) {
  if (!format || !format.format_id) return null;
  const host = req.get('host');
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const baseUrl = `${protocol}://${host}/proxy?targetUrl=${encodeURIComponent(targetUrl)}&formatId=${format.format_id}`;
  if (format.url) {
      return `${baseUrl}&rawUrl=${encodeURIComponent(format.url)}`;
  }
  return baseUrl;
}

function getOutputMetadata(isAudioOnly, emeExtension, info) {
  const mimeMap = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    mp4: 'video/mp4',
    webm: isAudioOnly ? 'audio/webm' : 'video/webm'
  };

  return {
    type: mimeMap[emeExtension] || (isAudioOnly ? `audio/${emeExtension}` : 'video/webm'),
    metadata: {
      title: info.title,
      artist: info.uploader || info.artist
    }
  };
}

exports.streamEvents = (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).end();
  addClient(id, res);
  req.on('close', () => {
    removeClient(id);
  });
};

async function getCookieArgs(videoURL, clientId) {
  const cookieType = getCookieType(videoURL);
  const cookiesPath = cookieType ? await downloadCookies(cookieType) : null;
  if (clientId)
    sendEvent(clientId, {
      status: 'fetching_info',
      progress: 10,
      subStatus: 'Bypassing restricted clients...',
      details: 'AUTH: BYPASSING_PROTOCOL_RESTRICTIONS'
    });
  return cookiesPath ? ['--cookies', cookiesPath] : [];
}

async function initializeSession(clientId) {
  if (!clientId) return;
  sendEvent(clientId, {
    status: 'fetching_info',
    progress: 5,
    subStatus: 'Initializing Session...',
    details: 'SESSION: STARTING_SECURE_CONTEXT'
  });
  setTimeout(
    () =>
      sendEvent(clientId, {
        status: 'fetching_info',
        progress: 7,
        subStatus: 'Resolving Host...',
        details: 'NETWORK: RESOLVING_CDN_EDGE_NODES'
      }),
    50
  );
}

async function logExtractionSteps(clientId, serviceName) {
  if (!clientId) return;
  sendEvent(clientId, {
    status: 'fetching_info',
    progress: 20,
    subStatus: `Extracting ${serviceName} Metadata...`,
    details: `ENGINE_YTDLP: INITIATING_CORE_EXTRACTION`
  });
  sendEvent(clientId, {
    status: 'fetching_info',
    progress: 40,
    subStatus: 'Analyzing Server-Side Signatures...',
    details: `NETWORK_HANDSHAKE: ESTABLISHING_SECURE_TUNNEL`
  });
  sendEvent(clientId, {
    status: 'fetching_info',
    progress: 60,
    subStatus: `Verifying ${serviceName} Handshake...`,
    details: `AUTH_GATEWAY: BYPASSING_PROTOCOL_RESTRICTIONS`
  });
}

exports.getVideoInformation = async (req, res) => {
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );
  const videoURL = req.query.url;
  const clientId = req.query.id;
  if (!videoURL || !isSupportedUrl(videoURL))
    return res.status(400).json({ error: 'No valid URL provided' });

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

    if (clientId)
      sendEvent(clientId, {
        status: 'fetching_info',
        progress: 85,
        subStatus: 'Resolving Target Data...'
      });

    const info = await getVideoInfo(targetURL, cookieArgs);

    if (!info.formats) {
      return res.json({
        title: info.title,
        thumbnail: info.thumbnail,
        formats: [],
        audioFormats: []
      });
    }

    const finalResponse = await prepareFinalResponse(
      info,
      isSpotify,
      spotifyData,
      videoURL
    );

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

function handleBrainHit(
  videoURL,
  targetURL,
  spotifyData,
  cookieArgs,
  clientId
) {
  if (!spotifyData.imageUrl || spotifyData.imageUrl === '/logo.webp') {
    (async () => {
      try {
        const info = await getVideoInfo(targetURL, cookieArgs);
        let finalThumbnail = getBestThumbnail(info);
        finalThumbnail = await proxyThumbnailIfNeeded(finalThumbnail, videoURL);
        if (clientId)
          sendEvent(clientId, {
            status: 'fetching_info',
            metadata_update: {
              cover: finalThumbnail,
              title: spotifyData.title,
              artist: spotifyData.artist
            }
          });
        saveToBrain(videoURL, { ...spotifyData, cover: finalThumbnail });
      } catch (e) {}
    })();
  }
}

async function resolveConvertTarget(videoURL, targetURL, cookieArgs) {
  if (targetURL && !isValidProxyUrl(targetURL)) {
    console.warn('[Security] Blocked invalid targetUrl in resolve');
    return videoURL;
  }
  if (targetURL) return targetURL;
  const spotifyData = videoURL.includes('spotify.com')
    ? await resolveSpotifyToYoutube(videoURL, cookieArgs)
    : null;
  return spotifyData ? spotifyData.targetUrl : videoURL;
}

exports.getStreamUrls = async (req, res) => {
  const { url: videoURL, id: clientId, formatId } = req.query;
  if (!videoURL || !isSupportedUrl(videoURL))
    return res.status(400).json({ error: 'No valid URL provided' });

  try {
    const cookieArgs = await getCookieArgs(videoURL, clientId);
    const resolvedTargetURL = await resolveConvertTarget(videoURL, req.query.targetUrl, cookieArgs);
    const info = await getVideoInfo(resolvedTargetURL, cookieArgs);

    const requestedFormat = info.formats.find(f => String(f.format_id) === String(formatId));
    const isAudioStream = f => !f || !f.vcodec || f.vcodec === 'none';
    const isAudioOnly = formatId === 'mp3' || videoURL.includes('spotify.com') || isAudioStream(requestedFormat);

    const finalVideoFormat = isAudioOnly ? null : selectVideoFormat(info.formats, formatId);
    const needsWebm = finalVideoFormat && !isAvc(finalVideoFormat);
    const finalAudioFormat = selectAudioFormat(info.formats, formatId, isAudioOnly, needsWebm);

    const videoTunnel = buildProxyUrl(req, finalVideoFormat, resolvedTargetURL);
    let audioTunnel = buildProxyUrl(req, finalAudioFormat, resolvedTargetURL);

    let emeExtension = isAudioOnly ? finalAudioFormat?.ext || 'mp3' : 'mp4';
    if (finalVideoFormat) emeExtension = needsWebm ? 'webm' : 'mp4';

    const filename = getSanitizedFilename(info.title, info.uploader, emeExtension, videoURL.includes('spotify.com'));

    if (isAudioOnly && audioTunnel) {
      audioTunnel += `&filename=${encodeURIComponent(filename)}&targetUrl=${encodeURIComponent(resolvedTargetURL)}&formatId=${formatId}`;
    }

    const outputMeta = getOutputMetadata(isAudioOnly, emeExtension, info);

    const totalSize = (estimateFilesize(finalVideoFormat || {}, info.duration) || 0) + (estimateFilesize(finalAudioFormat || {}, info.duration) || 0);

    res.json({
      status: 'local-processing',
      type: videoTunnel && audioTunnel ? 'merge' : 'proxy',
      tunnel: [videoTunnel, audioTunnel].filter(Boolean),
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

  if (targetUrl && formatId) {
      const { spawn } = require('child_process');
      const { USER_AGENT } = require('../services/ytdlp/config');
      
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      
      // Clean the formatId to prevent yt-dlp CLI from rejecting it (e.g., '140-drc' -> '140')
      const cleanFormatId = formatId.split('-')[0];

      // Attempt to guess mime type from formatId (rough estimate to help browser)
      let mimeType = 'application/octet-stream';
      if (cleanFormatId.includes('audio') || cleanFormatId === '251' || cleanFormatId === '140') mimeType = 'audio/mp4';
      if (cleanFormatId === '251') mimeType = 'audio/webm';
      res.setHeader('Content-Type', mimeType);
      
      if (filename) {
          const safeName = encodeURIComponent(filename);
          res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeName}`);
      }

      const args = [
          '--user-agent', USER_AGENT,
          '--no-warnings',
          '--ignore-config',
          '-f', cleanFormatId,
          '-o', '-',
          targetUrl
      ];

      const ytProcess = spawn('yt-dlp', args);

      ytProcess.stderr.on('data', () => {}); // Consume stderr to prevent pipe buffer deadlock
      ytProcess.stdout.pipe(res);

      req.on('close', () => {
          ytProcess.kill();
      });

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
  const timestamp = new Date().toLocaleTimeString();
  const safeEvent = String(event || 'unknown').replaceAll(/[^\w]/g, '_');
  console.log(`[EME_REPORT] [${timestamp}] EVENT:${safeEvent}`);
  res.status(204).end();
};

exports.convertVideo = async (req, res) => {
  if (req.method === 'HEAD') return res.status(200).end();
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );
  const data = { ...req.query, ...req.body };

  if (req.method === 'GET' && data.imageUrl && data.imageUrl.length > 2000) {
    data.imageUrl = '';
  }

  const {
    url: videoURL,
    id: clientId = Date.now().toString(),
    format = 'mp4',
    formatId
  } = data;
  if (!videoURL || !isSupportedUrl(videoURL))
    return res.status(400).json({ error: 'No valid URL provided' });

  const isSpotifyRequest = videoURL.includes('spotify.com');
  const filename = getSanitizedFilename(
    data.title || 'video',
    data.artist,
    format,
    isSpotifyRequest
  );

  if (clientId)
    sendEvent(clientId, {
      status: 'initializing',
      progress: 5,
      subStatus: 'Initializing Engine...',
      details: 'MUXER: PREPARING_VIRTUAL_CONTAINER'
    });

  (async () => {
    try {
      const cookieArgs = await getCookieArgs(videoURL, clientId);
      const resolvedTargetURL = await resolveConvertTarget(
        videoURL,
        data.targetUrl,
        cookieArgs
      );

      const { info, streamURL: finalStreamURL } = await resolveAudioFormatIfMp3(
        format,
        resolvedTargetURL,
        resolvedTargetURL,
        cookieArgs,
        formatId
      );

      if (!info || !info.formats) {
        throw new Error(
          'Failed to fetch media information. The link may be private or restricted.'
        );
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

      const videoProcess = streamDownload(
        finalStreamURL,
        { format, formatId },
        cookieArgs,
        info
      );
      
      const totalBytesSent = { value: 0 };
      setupStreamListeners(videoProcess, res, clientId, totalBytesSent);

      req.on('close', () => {
        if (videoProcess.exitCode === null) videoProcess.kill();
      });

      videoProcess.on('close', code => {
        if (code !== 0 && totalBytesSent.value > 0 && clientId)
          sendEvent(clientId, {
            status: 'error',
            message: 'Stream interrupted'
          });
        res.end();
      });
    } catch (error) {
      console.error('[ConvertVideo] Error:', error.message);
      if (clientId)
        sendEvent(clientId, {
          status: 'error',
          message: error.message || 'Internal server error'
        });
      if (!res.headersSent)
        res
          .status(500)
          .json({ error: error.message || 'Internal server error' });
    }
  })();
};

exports.seedIntelligence = async (req, res) => {
  const { url, id: clientId = 'admin-seeder' } = req.query;
  if (!url || !isValidSpotifyUrl(url))
    return res
      .status(400)
      .json({ error: 'Invalid Spotify Artist/Album URL provided' });

  try {
    let tracks = [];
    try {
      tracks = await getTracks(url);
    } catch (e) {}

    if (!tracks || tracks.length === 0) {
      const data = await getData(url);
      if (data && data.tracks)
        tracks = Array.isArray(data.tracks)
          ? data.tracks
          : data.tracks.items || [];
    }

    if (!tracks || tracks.length === 0)
      throw new Error(
        'No tracks found. Ensure it is a valid Spotify Track, Album, or Artist URL.'
      );

    res.json({
      message: 'Intelligence Gathering Started in Background',
      trackCount: tracks.length,
      target: url
    });
    processBackgroundTracks(tracks, clientId).catch(err =>
      console.error('[Seeder] Background Process Crashed:', err.message)
    );
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
};
