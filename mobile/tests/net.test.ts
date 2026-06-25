import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseRetryAfter,
  backoffMs,
  mapLimit,
  gatedFetch,
} from '../src/lib/net';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const stubResponse = (status: number, retryAfter?: string): Response =>
  ({
    status,
    ok: status < 400,
    headers: {
      get: (key: string) =>
        key.toLowerCase() === 'retry-after' ? (retryAfter ?? null) : null,
    },
  }) as unknown as Response;

describe('parseRetryAfter', () => {
  const anchor = Date.parse('2026-06-24T00:00:00Z');

  it.each<[string, string | null, number]>([
    ['null is zero', null, 0],
    ['delta-seconds', '120', 120000],
    ['zero seconds', '0', 0],
    ['garbage is zero', 'soon', 0],
  ])('%s', (_label, value, expected) => {
    expect(parseRetryAfter(value, anchor)).toBe(expected);
  });

  it('reads a future HTTP-date as a delta', () => {
    const future = new Date(anchor + 5000).toUTCString();
    expect(parseRetryAfter(future, anchor)).toBe(5000);
  });

  it('clamps a past HTTP-date to zero', () => {
    const past = new Date(anchor - 5000).toUTCString();
    expect(parseRetryAfter(past, anchor)).toBe(0);
  });
});

describe('backoffMs', () => {
  it('grows from the ~500ms base on the first attempt', () => {
    const delay = backoffMs(0, 0);
    expect(delay).toBeGreaterThanOrEqual(500);
    expect(delay).toBeLessThanOrEqual(750);
  });

  it('honors Retry-After when present', () => {
    const delay = backoffMs(0, 3000);
    expect(delay).toBeGreaterThanOrEqual(3000);
    expect(delay).toBeLessThanOrEqual(3250);
  });

  it('caps the backoff ceiling', () => {
    expect(backoffMs(0, 999999)).toBe(8000);
    expect(backoffMs(6, 0)).toBe(8000);
  });
});

describe('mapLimit', () => {
  it('preserves input order in results', async () => {
    const out = await mapLimit([1, 2, 3, 4], 2, (num) =>
      Promise.resolve(num * 2)
    );
    expect(out).toEqual([2, 4, 6, 8]);
  });

  it('handles an empty list', async () => {
    const out = await mapLimit<number, number>([], 3, (num) =>
      Promise.resolve(num)
    );
    expect(out).toEqual([]);
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    await mapLimit([1, 2, 3, 4, 5, 6, 7, 8], 3, async (num) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return num;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe('gatedFetch', () => {
  it('returns the response on the happy path', async () => {
    const spy = vi.fn().mockResolvedValue(stubResponse(200));
    globalThis.fetch = spy as unknown as typeof fetch;
    const res = await gatedFetch('https://happy.test/x');
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('retries once after a 429 then succeeds', async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce(stubResponse(429, '0'))
      .mockResolvedValueOnce(stubResponse(200));
    globalThis.fetch = spy as unknown as typeof fetch;
    const res = await gatedFetch('https://retry.test/y');
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
