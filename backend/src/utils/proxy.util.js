const https = require('node:https');
const http = require('node:http');
const { USER_AGENT } = require('../services/ytdlp/config');

function getProxyHeaders(url, incomingHeaders = {}) {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: '*/*',
    Connection: 'keep-alive'
  };

  // YouTube strictly throttles non-ranged requests to ~30KB/s.
  // We MUST provide a Range header to get full speed.
  headers['Range'] = incomingHeaders.range || incomingHeaders.Range || 'bytes=0-';

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

function pipeWebStream(url, localResponse, filename, incomingHeaders = {}) {
  return new Promise((resolve, reject) => {
      const requestHeaders = getProxyHeaders(url, incomingHeaders);
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;

      const req = client.get(url, { headers: requestHeaders }, (upstreamResponse) => {
        localResponse.status(upstreamResponse.statusCode);

        const passThrough = [
          'content-type',
          'content-length',
          'accept-ranges',
          'content-range',
          'cache-control'
        ];

        passThrough.forEach(h => {
          const val = upstreamResponse.headers[h];
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

        upstreamResponse.pipe(localResponse);

        localResponse.on('close', () => {
          upstreamResponse.destroy();
        });

        upstreamResponse.on('end', resolve);
        upstreamResponse.on('error', reject);
      });

      req.on('error', (err) => {
          console.error('[Proxy] Request Error:', err.message);
          if (!localResponse.headersSent) {
              localResponse.status(500).json({ error: 'Proxy fetch failed' });
          }
          reject(err);
      });
  });
}

module.exports = {
  getProxyHeaders,
  pipeWebStream
};
