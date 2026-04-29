import { Response } from 'express';
import { Pool } from 'undici';
import { URL } from 'node:url';
import { PassThrough } from 'node:stream';
// @ts-ignore
import { USER_AGENT } from '../services/ytdlp/config.js';

// enterprise connection pool
const pools = new Map<string, Pool>();

function getPool(url: string): Pool {
  const urlObj = new URL(url);
  const origin = urlObj.origin;
  
  if (!pools.has(origin)) {
    console.log(`[Quantum-Undici] Creating new connection pool for: ${origin}`);
    
    // bypass cdn ssl
    const isCDN = origin.includes('ytimg.com') || origin.includes('fbcdn.net') || origin.includes('tiktokv.com');
    
    pools.set(origin, new Pool(origin, {
      connections: 20, // concurrent streams
      pipelining: 1,
      keepAliveTimeout: 60000,
      connect: {
        rejectUnauthorized: !isCDN // allow cdn mismatch
      }
    }));
  }
  return pools.get(origin)!;
}

export function getProxyHeaders(url: string, incomingHeaders: Record<string, any> = {}): Record<string, string> {
  // strip incompatible headers
  const { host, connection, ...rest } = incomingHeaders;
  
  const headers: Record<string, string> = {
    'user-agent': USER_AGENT,
    'accept': '*/*',
    'connection': 'keep-alive',
    ...rest // allow overrides
  };

  const range = incomingHeaders.range || incomingHeaders.Range || 'bytes=0-';
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
  incomingHeaders: Record<string, any> = {}, 
  redirectCount: number = 0
): Promise<any> {
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
    }, ({ statusCode, headers, opaque }: any) => {
      const { localResponse, filename, url, redirectCount } = opaque;

      // handle redirects
      if ([301, 302, 307, 308].includes(statusCode) && headers.location) {
        const redirectUrl = new URL(headers.location as string, url).toString();
        console.log(`[Quantum-Undici] Redirecting ${statusCode} -> ${redirectUrl.substring(0, 50)}...`);
        return pipeWebStream(redirectUrl, localResponse, filename, incomingHeaders, redirectCount + 1);
      }

      // log status
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });
      const size = headers['content-length'] ? `${(Number(headers['content-length'])/1024/1024).toFixed(1)}MB` : 'unknown';
      console.log(`[${timestamp}] [Quantum-Undici] ${statusCode} OK (${size}) -> ${url.substring(0, 40)}...`);

      // set local headers
      localResponse.status(statusCode);
      const passThrough = ['content-type', 'content-length', 'accept-ranges', 'content-range', 'cache-control'];
      passThrough.forEach(h => {
        if (headers[h]) localResponse.setHeader(h, headers[h] as string);
      });

      if (url.includes('googlevideo.com') && !localResponse.getHeader('content-type')) {
          localResponse.setHeader('Content-Type', url.includes('mime=audio') ? 'audio/mp4' : 'video/mp4');
      }

      localResponse.setHeader('Access-Control-Allow-Origin', '*');
      localResponse.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

      if (filename) {
        localResponse.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      }

      // zero-copy pipe
      return localResponse;
    });
  } catch (err: any) {
    console.error(`[Quantum-Undici] Stream Error:`, err.message);
    if (!localResponse.headersSent) localResponse.status(500).end();
    throw err;
  }
}

export async function getQuantumStream(url: string, customHeaders: Record<string, string> = {}): Promise<PassThrough> {
  const urlObj = new URL(url);
  const client = getPool(url);
  const stream = new PassThrough();

  // return writable stream
  client.stream({
    path: urlObj.pathname + urlObj.search,
    method: 'GET',
    headers: { ...getProxyHeaders(url), ...customHeaders }
  }, ({ statusCode }: any) => {
    if (statusCode >= 400) {
      stream.emit('error', new Error(`HTTP ${statusCode}`));
    }
    return stream;
  }, (err: any) => {
    if (err) {
      console.error(`[Quantum-Undici] Helper Error:`, err.message);
      stream.emit('error', err);
    }
  });

  return stream;
}
