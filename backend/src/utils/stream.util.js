const { sendEvent } = require('./sse.util');

const isDirect = f =>
  f.url &&
  !f.url.includes('youtube.com/watch') &&
  !f.url.includes('youtu.be/') &&
  (!f.protocol || (
    !f.protocol.includes('m3u8') &&
    !f.protocol.includes('manifest')
  )) &&
  !f.url.includes('.m3u8');

const isAvc = f => {
  if (!f) return false;
  const vcodec = f.vcodec || '';
  // strict check for h264
  return vcodec.startsWith('avc1') || vcodec.startsWith('h264');
};

function selectVideoFormat(formats, formatId) {
  const isMuxed = f => f.vcodec !== 'none' && f.acodec !== 'none';
  
  // prefer h264
  const videoFormats = formats.filter(f => f.vcodec && f.vcodec !== 'none');

  if (videoFormats.length === 0) return null;

  const h264Formats = videoFormats.filter(f => 
    f.vcodec.startsWith('avc1') || f.vcodec.startsWith('h264')
  );

  const available = (h264Formats.length > 0 ? h264Formats : videoFormats)
    .sort((a, b) => {
      const hA = a.height || 0;
      const hB = b.height || 0;
      if (hB !== hA) return hB - hA;
      if (isMuxed(b) && !isMuxed(a)) return 1;
      return -1;
    });

  // check requested
  const requested = videoFormats.find(f => String(f.format_id) === String(formatId));
  if (requested) return requested;

  // fallback quality
  const selected = available.find(f => f.height <= 1080) || available[0];

  return selected;
}

function selectAudioFormat(formats, formatId, isAudioOnly, needsWebm) {
  const available = formats.filter(f => f.acodec !== 'none');
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
  const baseUrl = `${protocol}://${host}/proxy?targetUrl=${encodeURIComponent(targetUrl)}&formatId=${format.format_id}&ext=${format.ext || 'mp4'}`;
  if (isDirect(format)) {
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
    type: mimeMap[emeExtension] || (isAudioOnly ? `audio/${emeExtension}` : 'video/mp4'),
    metadata: {
      title: info.title,
      artist: info.uploader || info.artist
    }
  };
}

function setupStreamListeners(videoProcess, res, clientId, totalBytesSent) {
  if (clientId) {
    sendEvent(clientId, {
      status: 'downloading',
      progress: 30,
      subStatus: 'STREAMING: Initializing Handshake...'
    });
  }

  videoProcess.on('progress', progress => {
    if (clientId) {
      const scaledProgress = 30 + (progress * 0.70);
      sendEvent(clientId, {
        status: 'downloading',
        progress: Math.min(100, Math.round(scaledProgress)),
        subStatus: `STREAMING: ${progress.toFixed(1)}%`
      });
    }
  });

  videoProcess.on('data', chunk => {
    if (totalBytesSent.value === 0) {
      if (clientId) {
        sendEvent(clientId, {
          status: 'downloading',
          progress: 30,
          subStatus: 'TRANSMITTING: Streaming via EME'
        });
      }
    }
    totalBytesSent.value += chunk.length;
  });

  videoProcess.pipe(res);

  videoProcess.on('close', (code) => {
    if (clientId) {
      sendEvent(clientId, {
        status: 'finished',
        progress: 100,
        subStatus: `STREAMING: Finalized (${(totalBytesSent.value / (1024 * 1024)).toFixed(1)}MB)`
      });
    }
    if (!res.writableEnded) res.end();
  });

  videoProcess.on('error', err => {
    console.error('[Convert] Stream Error:', err.message);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Stream generation failed' });
    } else {
        res.end();
    }
  });
}

module.exports = {
  isDirect,
  isAvc,
  selectVideoFormat,
  selectAudioFormat,
  buildProxyUrl,
  getOutputMetadata,
  setupStreamListeners
};
