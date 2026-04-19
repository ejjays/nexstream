const { Pool, pipeline } = require('undici');
const { USER_AGENT } = require('../services/ytdlp/config');

// connection pooling for enterprise performance
const pools = new Map();

function getPool(url) {
  const urlObj = new URL(url);
  const origin = urlObj.origin;
  
  if (!pools.has(origin)) {
    console.log(`[Quantum-Undici] Creating new connection pool for: ${origin}`);
    pools.set(origin, new Pool(origin, {
      connections: 20, // allow 20 concurrent streams per domain
      pipelining: 1,
      keepAliveTimeout: 60000,
      keepAliveMaxTimeout: 60000
    }));
  }
  return pools.get(origin);
}

function getProxyHeaders(url, incomingHeaders = {}) {
  const headers = {
    'user-agent': USER_AGENT,
    'accept': '*/*',
    'connection': 'keep-alive'
  };

  const range = incomingHeaders.range || incomingHeaders.Range || 'bytes=0-';
  if (range) headers['range'] = range;

  const urlObj = new URL(url);
  const hostname = urlObj.hostname;

  if (hostname.includes('googlevideo.com') || hostname.includes('youtube.com')) {
    headers['referer'] = 'https://www.youtube.com/';
    headers['origin'] = 'https://www.youtube.com';
  } else if (hostname.includes('tiktok.com')) {
    headers['referer'] = 'https://www.tiktok.com/';
  } else if (hostname.includes('instagram.com')) {
    headers['referer'] = 'https://www.instagram.com/';
  } else if (hostname.includes('facebook.com') || hostname.includes('fbcdn.net')) {
    headers['referer'] = 'https://www.facebook.com/';
  } else if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
    headers['referer'] = 'https://twitter.com/';
  }

  return headers;
}

async function pipeWebStream(url, localResponse, filename, incomingHeaders = {}, redirectCount = 0) {
  if (redirectCount > 5) throw new Error('Too many redirects');

  const urlObj = new URL(url);
  const client = getPool(url);
  const requestHeaders = getProxyHeaders(url, incomingHeaders);

  try {
    return await client.stream({
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: requestHeaders,
      opaque: { localResponse, filename, url, incomingHeaders, redirectCount }
    }, ({ statusCode, headers, opaque }) => {
      const { localResponse, filename, url, redirectCount } = opaque;

      // handle redirects
      if ([301, 302, 307, 308].includes(statusCode) && headers.location) {
        const redirectUrl = new URL(headers.location, url).toString();
        console.log(`[Quantum-Undici] Redirecting ${statusCode} -> ${redirectUrl.substring(0, 50)}...`);
        return pipeWebStream(redirectUrl, localResponse, filename, incomingHeaders, redirectCount + 1);
      }

      // log status
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });
      const size = headers['content-length'] ? `${(headers['content-length']/1024/1024).toFixed(1)}MB` : 'unknown';
      console.log(`[${timestamp}] [Quantum-Undici] ${statusCode} OK (${size}) -> ${url.substring(0, 40)}...`);

      // set local headers
      localResponse.status(statusCode);
      const passThrough = ['content-type', 'content-length', 'accept-ranges', 'content-range', 'cache-control'];
      passThrough.forEach(h => {
        if (headers[h]) localResponse.setHeader(h, headers[h]);
      });

      if (url.includes('googlevideo.com') && !localResponse.getHeader('content-type')) {
          localResponse.setHeader('Content-Type', url.includes('mime=audio') ? 'audio/mp4' : 'video/mp4');
      }

      localResponse.setHeader('Access-Control-Allow-Origin', '*');
      localResponse.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

      if (filename) {
        localResponse.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      }

      // ultra-fast zero-copy pipe
      return localResponse;
    });
  } catch (err) {
    console.error(`[Quantum-Undici] Stream Error:`, err.message);
    if (!localResponse.headersSent) localResponse.status(500).end();
    throw err;
  }
}

async function getQuantumStream(url, customHeaders = {}) {
  const urlObj = new URL(url);
  const client = getPool(url);
  const { PassThrough } = require('node:stream');
  const stream = new PassThrough();

  // undici stream expects the factory to return a Writable
  client.stream({
    path: urlObj.pathname + urlObj.search,
    method: 'GET',
    headers: { ...getProxyHeaders(url), ...customHeaders }
  }, ({ statusCode }) => {
    if (statusCode >= 400) {
      stream.emit('error', new Error(`HTTP ${statusCode}`));
      return null;
    }
    return stream;
  }, (err) => {
    if (err) {
      console.error(`[Quantum-Undici] Helper Error:`, err.message);
      stream.emit('error', err);
    }
  });

  return stream;
}

module.exports = {
  getProxyHeaders,
  pipeWebStream,
  getQuantumStream
};
