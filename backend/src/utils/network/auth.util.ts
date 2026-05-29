import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';

function isLocalhost(ip: string | undefined): boolean {
  const normalized = ip?.replace(/^::ffff:/u, '');
  return normalized === '127.0.0.1' || normalized === '::1';
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
  if (isLocalhost(req.ip)) {
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
