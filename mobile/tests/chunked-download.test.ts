import { describe, it, expect, vi } from 'vitest';

vi.mock('expo-file-system', () => ({
  File: class {},
  FileMode: { WriteOnly: 'writeonly' },
}));
vi.mock('../src/lib/retry', () => ({
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}));

import { chunkedDownload } from '../src/lib/download';

const CHUNK = 4_000_000; // mirrors download.ts

describe('chunkedDownload', () => {
  it('fetches ranges in parallel and writes them in order', async () => {
    const total = CHUNK * 3 + 100; // 4 chunks: 3 full + tail
    const ranges: string[] = [];

    const fetchMock = vi.fn(
      (
        _url: string,
        init?: { headers?: Record<string, string> }
      ): Promise<{
        ok: boolean;
        status: number;
        headers?: { get: (k: string) => string | null };
        arrayBuffer: () => Promise<ArrayBuffer>;
      }> => {
        const range = init?.headers?.Range ?? '';
        if (range === 'bytes=0-0') {
          return Promise.resolve({
            ok: true,
            status: 206,
            headers: {
              get: (k: string) =>
                k.toLowerCase() === 'content-range'
                  ? `bytes 0-0/${total}`
                  : null,
            },
            arrayBuffer: () =>
              Promise.resolve(new Uint8Array(1).buffer as ArrayBuffer),
          });
        }
        ranges.push(range);
        const start = Number(/bytes=(\d+)-/u.exec(range)?.[1] ?? 0);
        const idx = start / CHUNK;
        // later chunks resolve first -> exercises reordering
        return new Promise((res) =>
          setTimeout(
            () =>
              res({
                ok: true,
                status: 206,
                arrayBuffer: () =>
                  Promise.resolve(new Uint8Array([idx]).buffer as ArrayBuffer),
              }),
            (4 - idx) * 5
          )
        );
      }
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const written: number[] = [];
    const handle = {
      writeBytes: (buf: Uint8Array) => written.push(buf[0]),
      close: vi.fn(),
    };
    const file = {
      exists: false,
      delete: vi.fn(),
      create: vi.fn(),
      open: () => handle,
    };

    await chunkedDownload(
      'https://gv.example/videoplayback',
      {},
      file as unknown as Parameters<typeof chunkedDownload>[2],
      () => {}
    );

    expect(written).toEqual([0, 1, 2, 3]);
    expect(ranges).toHaveLength(4);
    expect(ranges[0]).toBe(`bytes=0-${CHUNK - 1}`);
  });
});
