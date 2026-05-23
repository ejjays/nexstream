import { lookup } from 'node:dns/promises';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import { URL } from 'node:url';
import { fetch as undiciFetch, Agent } from 'undici';
import { createRedisClient } from '../infra/redis.util.js';

const redis = createRedisClient('security');

const PRIVATE_IP_RANGES = [
  /^127\./, // localhost
  /^10\./, // class A
  /^192\.168\./, // class C
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // class B
  /^169\.254\./, // link-local
  /^0\./, // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // carrier-grade NAT
  /^255\.255\.255\.255$/, // broadcast
  /^(22[4-9]|23[0-9])\./, // multicast IPv4
  /^::1$/, // IPv6 local
  /^[fF][cCdD]/, // IPv6 unique
  /^[fF][eE][89aAbB]/, // IPv6 link-local
  /^::$/, // IPv6 unspecified
  /^[fF][ff]/, // IPv6 multicast
  /^::ffff:(?:127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.|0\.|100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\.|255\.255\.255\.255|22[4-9]\.|23[0-9]\.)/, // IPv4-mapped private
];

// check IP safety
export function isSafeIp(ip: string): boolean {
  if (!isIP(ip)) return false;
  return !PRIVATE_IP_RANGES.some((regex) => regex.test(ip));
}

// resolve and check
export async function resolveAndValidateHost(
  hostname: string
): Promise<string> {
  // check direct IP
  if (isIP(hostname)) {
    if (!isSafeIp(hostname)) {
      throw new Error(
        `SSRF Blocked: Attempted to access private IP (${hostname})`
      );
    }
    return hostname;
  }

  try {
    const { address } = await lookup(hostname, { family: 0 });
    if (!isSafeIp(address)) {
      throw new Error(
        `SSRF Blocked: Hostname ${hostname} resolved to private IP (${address})`
      );
    }
    return address;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('SSRF')) throw err;
    throw new Error(`DNS Lookup failed for hostname: ${hostname}`, {
      cause: err,
    });
  }
}

const ssrfSafeAgent = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      return dnsLookup(hostname, options, (err, address, family) => {
        if (err) {
          callback(err, address as unknown as string, family);
          return;
        }

        const isArray = Array.isArray(address);
        const addrsToCheck = isArray
          ? (address as LookupAddress[])
          : [{ address: address as unknown as string }];

        for (const addr of addrsToCheck) {
          if (!isSafeIp(addr.address)) {
            callback(
              new Error(
                `[SSRF BLOCK] Resolution to internal IP blocked: ${addr.address}`
              ),
              address as unknown as string,
              family
            );
            return;
          }
        }

        // validate IPs
        callback(null, address as unknown as string, family);
      });
    },
  },
});

/**
 * secure fetch wrapper
 */
export async function secureFetch(
  targetUrl: string | URL,
  options: RequestInit = {}
): Promise<globalThis.Response> {
  const parsedUrl =
    typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl;
  const normalizedHeaders = new Headers(options.headers as HeadersInit);

  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    const res = await fetch(parsedUrl.toString(), {
      ...options,
      headers: normalizedHeaders,
      redirect: 'follow',
    });
    return res as globalThis.Response;
  }

  const response = await undiciFetch(parsedUrl.toString(), {
    ...(options as unknown as Record<string, unknown>),
    headers: normalizedHeaders,
    dispatcher: ssrfSafeAgent,
    redirect: 'follow',
  });

  return response as unknown as globalThis.Response;
}

export async function acquireLock(ip: string, limit = 2): Promise<boolean> {
  const key = `lock:concurrency:${ip}`;
  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(key, 1800);
  }

  if (current > limit) {
    await redis.decr(key);
    return false;
  }
  return true;
}

export async function releaseLock(ip: string): Promise<void> {
  const key = `lock:concurrency:${ip}`;
  await redis.decr(key);
  const val = await redis.get(key);
  if (val && parseInt(val) <= 0) {
    await redis.del(key);
  }
}

import { Request, Response, NextFunction } from 'express';
import { sendEvent } from './sse.util.js';

/**
 * limit active operations
 */
export const concurrencyGuard = (limit = 2) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.ip || 'unknown';
    const clientId = (req.query.id || req.body.id) as string | undefined;

    const hasLock = await acquireLock(clientIp, limit);
    if (!hasLock) {
      if (clientId) {
        sendEvent(clientId, {
          status: 'error',
          message: 'Too many active operations. Please wait for one to finish.',
        });
      }
      res.status(429).json({ error: 'Concurrency limit reached.' });
      return;
    }

    let released = false;
    const cleanup = () => {
      if (!released) {
        released = true;
        releaseLock(clientIp).catch((e) =>
          console.error('[Security] Lock release error:', e)
        );
      }
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);

    next();
  };
};
