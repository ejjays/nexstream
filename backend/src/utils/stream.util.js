const { sendEvent } = require('./sse.util');

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

function setupStreamListeners(videoProcess, res, clientId, totalBytesSent) {
  videoProcess.stdout.on('data', chunk => {
    if (totalBytesSent.value === 0) {
      if (clientId) {
        sendEvent(clientId, {
          status: 'downloading',
          progress: 100,
          subStatus: 'TRANSMITTING: Streaming via EME'
        });
      }
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

module.exports = {
  isDirect,
  isAvc,
  selectVideoFormat,
  selectAudioFormat,
  buildProxyUrl,
  getOutputMetadata,
  setupStreamListeners
};
