import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';

function isLocalRequest(req: Request): boolean {
  // proxied/spoofed requests are not local
  if (req.headers['x-forwarded-for']) return false;
  const ip = req.socket.remoteAddress?.replace(/^::ffff:/u, '');
  return ip === '127.0.0.1' || ip === '::1';
}

// fail fast on unsafe prod config
export function assertProdConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  if (!env.API_KEY) {
    throw new Error('API_KEY is required when NODE_ENV=production');
  }
  if (!env.PROXY_SIGNING_SECRET) {
    throw new Error('PROXY_SIGNING_SECRET is required when NODE_ENV=production');
  }
}

function extractKey(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string') return headerKey;
  const queryKey = req.query.key ?? req.query.apiKey;
  return typeof queryKey === 'string' ? queryKey : undefined;
}

function keysMatch(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

export function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const expected = process.env.API_KEY;
  // disabled until a key is configured
  if (!expected) {
    next();
    return;
  }
  // local self-host stays frictionless
  if (isLocalRequest(req)) {
    next();
    return;
  }
  const provided = extractKey(req);
  if (provided && keysMatch(provided, expected)) {
    next();
    return;
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// metrics gate: localhost or valid key
export function requireLocalOrApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (isLocalRequest(req)) {
    next();
    return;
  }
  const expected = process.env.API_KEY;
  const provided = extractKey(req);
  if (expected && provided && keysMatch(provided, expected)) {
    next();
    return;
  }
  res.status(403).json({ error: 'Forbidden' });
}
