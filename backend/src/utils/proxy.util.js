const { USER_AGENT } = require('../services/ytdlp/config');

function getProxyHeaders(url, incomingHeaders = {}) {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: '*/*',
    Connection: 'keep-alive'
  };

  if (incomingHeaders.range) {
    headers['Range'] = incomingHeaders.range;
  }

  const urlObj = new URL(url);
  const hostname = urlObj.hostname;

  if (
    hostname.includes('googlevideo.com') ||
    hostname.includes('youtube.com')
  ) {
    headers['Referer'] = 'https://www.youtube.com/';
    headers['Origin'] = 'https://www.youtube.com';
  } else if (hostname.includes('tiktok.com')) {
    headers['Referer'] = 'https://www.tiktok.com/';
  } else if (hostname.includes('instagram.com')) {
    headers['Referer'] = 'https://www.instagram.com/';
  } else if (
    hostname.includes('facebook.com') ||
    hostname.includes('fbcdn.net')
  ) {
    headers['Referer'] = 'https://www.facebook.com/';
  } else if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
    headers['Referer'] = 'https://twitter.com/';
  }

  return headers;
}

async function pipeWebStream(upstreamResponse, localResponse, filename) {
  localResponse.status(upstreamResponse.status);

  const passThrough = [
    'content-type',
    'content-length',
    'accept-ranges',
    'content-range',
    'cache-control'
  ];

  passThrough.forEach(h => {
    const val = upstreamResponse.headers.get(h);
    if (val) localResponse.setHeader(h, val);
  });

  localResponse.setHeader('Access-Control-Allow-Origin', '*');
  localResponse.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  if (filename) {
    const safeName = encodeURIComponent(filename);
    localResponse.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${safeName}`
    );
  }

  const reader = upstreamResponse.body.getReader();

  localResponse.on('close', () => {
    reader
      .cancel()
      .catch(err => console.warn('[Proxy] Stream cancel error:', err.message));
  });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      localResponse.write(value);
    }
    localResponse.end();
  } catch (streamErr) {
    console.error('[Proxy] Stream Pipeline Error:', streamErr.message);
    if (!localResponse.writableEnded) {
      localResponse.destroy();
    }
  }
}

module.exports = {
  getProxyHeaders,
  pipeWebStream
};
