const { USER_AGENT } = require('./ytdlp/config');

/**
 * Generates platform-specific headers to bypass simple bot detection and referer checks.
 * 
 * @param {string} url - The target streaming URL.
 * @param {Object} incomingHeaders - Headers from the original client request (e.g., Range).
 * @returns {Object} A sanitized and optimized header object for the upstream request.
 */
function getProxyHeaders(url, incomingHeaders = {}) {
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': '*/*',
    'Connection': 'keep-alive'
  };

  // Pass through Range header for seeking support
  if (incomingHeaders.range) {
    headers['Range'] = incomingHeaders.range;
  }

  const urlObj = new URL(url);
  const hostname = urlObj.hostname;

  // Platform-specific bypass logic
  if (hostname.includes('googlevideo.com') || hostname.includes('youtube.com')) {
    headers['Referer'] = 'https://www.youtube.com/';
    headers['Origin'] = 'https://www.youtube.com';
  } else if (hostname.includes('tiktok.com')) {
    headers['Referer'] = 'https://www.tiktok.com/';
  } else if (hostname.includes('instagram.com')) {
    headers['Referer'] = 'https://www.instagram.com/';
  } else if (hostname.includes('facebook.com') || hostname.includes('fbcdn.net')) {
    headers['Referer'] = 'https://www.facebook.com/';
  } else if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
    headers['Referer'] = 'https://twitter.com/';
  }

  return headers;
}

/**
 * Safely streams an upstream response to a local Express response.
 * Handles partial content (206) and client disconnects.
 * 
 * @param {Response} upstreamResponse - The Fetch API Response object.
 * @param {import('express').Response} localResponse - The Express response object.
 * @param {string} filename - Optional filename for Content-Disposition.
 */
async function pipeWebStream(upstreamResponse, localResponse, filename) {
  // Pass through status code (important for 206 Partial Content)
  localResponse.status(upstreamResponse.status);

  // Essential streaming headers
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

  // Security and CORS
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

  // Ensure we stop fetching if the client closes the connection
  localResponse.on('close', () => {
    reader.cancel().catch(err => console.warn('[Proxy] Stream cancel error:', err.message));
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
