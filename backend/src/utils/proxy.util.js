const https = require('node:https');
const http = require('node:http');
const { USER_AGENT } = require('../services/ytdlp/config');

function getProxyHeaders(url, incomingHeaders = {}) {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: '*/*',
    Connection: 'keep-alive'
  };

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
        const statusCode = upstreamResponse.statusCode;
        const contentLength = upstreamResponse.headers['content-length'];
        
        if (statusCode >= 400) {
            console.error(`[Proxy] Upstream Error: ${statusCode} for ${url.substring(0, 100)}...`);
        } else {
            const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });
            console.log(`[${timestamp}] [Proxy] ${statusCode} OK (${(contentLength/1024/1024).toFixed(1)}MB) -> ${url.substring(0, 60)}...`);
        }

        localResponse.status(statusCode);

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

        if (url.includes('googlevideo.com') && !localResponse.getHeader('content-type')) {
            const isAudio = url.includes('mime=audio');
            localResponse.setHeader('Content-Type', isAudio ? 'audio/mp4' : 'video/mp4');
        }

        localResponse.setHeader('Access-Control-Allow-Origin', '*');
        localResponse.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        localResponse.setHeader('Access-Control-Allow-Headers', '*');
        localResponse.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        localResponse.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

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
