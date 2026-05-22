import { Response } from 'express';
import { Pool } from 'undici';
import { URL } from 'node:url';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { USER_AGENT } from '../../services/ytdlp/config.js';
import { LRUCache } from 'lru-cache';
import { resolveAndValidateHost } from './security.util.js';

const pools = new LRUCache<string, Pool>({
  max: 100, // max origins
  dispose: (pool: Pool, key: string) => {
    console.log(`[Quantum-Undici] Disposing connection pool for: ${key}`);
    pool.close().catch(console.error);
  }
});

function getPool(url: string, originalHost?: string): Pool {
  const urlObj = new URL(url);
  const origin = urlObj.origin;

  if (!pools.has(origin)) {
    console.log(`[Quantum-Undici] Creating new connection pool for: ${origin}`);

    // bypass SSL
    const hostToCheck = originalHost || urlObj.hostname;
    const isCDN = hostToCheck.includes('ytimg.com') || hostToCheck.includes('fbcdn.net') || hostToCheck.includes('tiktokv.com') || hostToCheck.includes('googlevideo.com');

    pools.set(origin, new Pool(origin, {
      connections: 20, // max streams
      pipelining: 1,
      keepAliveTimeout: 60000,
      connect: {
        rejectUnauthorized: !isCDN,
        servername: originalHost // fix SNI/TLS
      }
    }));
  }
  const pool = pools.get(origin);
  if (!pool) throw new Error(`Failed to create connection pool for ${origin}`);
  return pool;
}

export function getProxyHeaders(url: string, incomingHeaders: Record<string, string | undefined> = {}): Record<string, string> {
  const rest: Record<string, string> = {};
  for (const [key, value] of Object.entries(incomingHeaders)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey !== 'host' && lowerKey !== 'connection' && lowerKey !== 'user-agent' && lowerKey !== 'accept' && value !== undefined) {
      rest[lowerKey] = value as string;
    }
  }
  
  const headers: Record<string, string> = {
    'user-agent': USER_AGENT,
    'accept': '*/*',
    'connection': 'keep-alive',
    ...rest
  };

  const range = incomingHeaders.range ?? incomingHeaders.Range ?? 'bytes=0-';
  if (range) headers['range'] = range;

  const urlObj = new URL(url);
  const hostname = urlObj.hostname;

  if (hostname.includes('googlevideo.com') || hostname.includes('youtube.com')) {
    if (!headers['referer']) headers['referer'] = 'https://www.youtube.com/';
    if (!headers['origin']) headers['origin'] = 'https://www.youtube.com';
  } else if (hostname.includes('tiktok.com')) {
    if (!headers['referer']) headers['referer'] = 'https://www.tiktok.com/';
  } else if (hostname.includes('instagram.com')) {
    if (!headers['referer']) headers['referer'] = 'https://www.instagram.com/';
  } else if (hostname.includes('facebook.com') || hostname.includes('fbcdn.net')) {
    if (!headers['referer']) headers['referer'] = 'https://www.facebook.com/';
  } else if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
    if (!headers['referer']) headers['referer'] = 'https://twitter.com/';
  }

  return headers;
}

export async function pipeWebStream(
  url: string, 
  localResponse: Response, 
  filename: string | undefined, 
  incomingHeaders: Record<string, string | undefined> = {}, 
  redirectCount = 0,
  signal?: AbortSignal
): Promise<boolean> {
  if (redirectCount > 5) throw new Error('Too many redirects');

  const urlObj = new URL(url);
  
  // SSRF guard
  const resolvedIp = await resolveAndValidateHost(urlObj.hostname);
  
  // anti-rebinding IP
  const safeIp = resolvedIp.includes(':') ? `[${resolvedIp}]` : resolvedIp;
  const port = urlObj.port ? `:${urlObj.port}` : '';
  const poolUrl = `${urlObj.protocol}//${safeIp}${port}`;
  const client = getPool(poolUrl, urlObj.hostname);
  
  const requestHeaders = getProxyHeaders(url, incomingHeaders);
  // set Host header
  requestHeaders['host'] = urlObj.host;

  try {
    const { statusCode, headers, body } = await client.request({
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: requestHeaders,
      signal
    });

    // redirect
    if ([301, 302, 307, 308].includes(statusCode) && typeof headers.location === 'string') {
      const redirectUrl = new URL(headers.location, url).toString();
      console.log(`[Quantum-Undici] Redirecting ${statusCode} -> ${redirectUrl.substring(0, 50)}...`);
      // consume body
      body.on('data', () => { /* ignore */ });
      return pipeWebStream(redirectUrl, localResponse, filename, incomingHeaders, redirectCount + 1, signal);
    }

    // log status
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });
    const size = headers['content-length']
      ? `${(Number(headers['content-length'])/1024/1024).toFixed(1)}MB`
      : 'unknown';
    console.log(`[${timestamp}] [Quantum-Undici] ${statusCode} OK (${size}) -> ${url.substring(0, 40)}...`);

    // check sent headers
    if (!localResponse.headersSent) {
      localResponse.status(statusCode);
      const passThrough = ['content-type', 'content-length', 'accept-ranges', 'content-range', 'cache-control'];
      passThrough.forEach(h => {
        if (headers[h]) localResponse.setHeader(h, headers[h] as string | string[]);
      });

      if (url.includes('googlevideo.com') && !localResponse.getHeader('content-type')) {
          localResponse.setHeader('Content-Type', url.includes('mime=audio') ? 'audio/mp4' : 'video/mp4');
      }

      localResponse.setHeader('Access-Control-Allow-Origin', '*');
      localResponse.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

      if (filename) {
        localResponse.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      }
    }

    await pipeline(body, localResponse, { signal });
    return true;

  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.name === 'AbortError') {
      console.warn('[Quantum-Undici] Client disconnected; media stream aborted gracefully.');
      return false;
    }
    console.error('[Quantum-Undici] Stream Error:', error.message);
    if (!localResponse.headersSent) localResponse.status(500).end();
    throw error;
  }
}

export function getQuantumStream(url: string, customHeaders: Record<string, string> = {}): PassThrough {
  const stream = new PassThrough();
  const urlObj = new URL(url);

  resolveAndValidateHost(urlObj.hostname)
    .then((resolvedIp) => {
      const safeIp = resolvedIp.includes(':') ? `[${resolvedIp}]` : resolvedIp;
      const port = urlObj.port ? `:${urlObj.port}` : '';
      const poolUrl = `${urlObj.protocol}//${safeIp}${port}`;
      const client = getPool(poolUrl, urlObj.hostname);
      
      const requestHeaders = getProxyHeaders(url, customHeaders);
      requestHeaders['host'] = urlObj.host;

      client.stream({
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: requestHeaders
      }, ({ statusCode }) => {
        if (statusCode >= 400) {
          stream.emit('error', new Error(`HTTP ${statusCode}`));
        }
        return stream;
      }, (err) => {
        if (err) {
          if (err.message !== 'Premature close') {
            console.error('[Quantum-Undici] Helper Error:', err.message);
          }
          stream.emit('error', err);
        }
      });
    })
    .catch((err) => {
      console.error('[Quantum-Undici] SSRF/DNS Block:', err.message);
      stream.destroy(err);
    });

  return stream;
}
