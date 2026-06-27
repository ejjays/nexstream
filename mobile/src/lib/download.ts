import { File, FileMode } from 'expo-file-system';
import { withRetry } from './retry';
import { orderedParallelToFile } from './hls';

// webview-heavy path: keep download heap ~serial
const CHUNK = 4_000_000;
const CONCURRENCY = 2;

export async function chunkedDownload(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (written: number, total: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const head = await fetch(url, {
    headers: { ...headers, Range: 'bytes=0-0' },
    signal,
  });
  await head.arrayBuffer();

  let total = 0;
  const range = head.headers.get('content-range');
  const match = range ? /\/(\d+)\s*$/u.exec(range) : null;
  if (match) total = parseInt(match[1], 10);
  if (!total) {
    const len = head.headers.get('content-length');
    total = len ? parseInt(len, 10) : 0;
  }
  if (total <= 0) throw new Error('chunked: unknown size');

  if (file.exists) file.delete();
  file.create();
  const handle = file.open(FileMode.WriteOnly);
  const started = Date.now();
  try {
    const chunks = Math.ceil(total / CHUNK);
    await orderedParallelToFile(
      chunks,
      (idx) =>
        withRetry(
          async () => {
            const start = idx * CHUNK;
            const end = Math.min(start + CHUNK, total) - 1;
            const res = await fetch(url, {
              headers: { ...headers, Range: `bytes=${start}-${end}` },
              signal,
            });
            if (res.status >= 400)
              throw new Error(`chunked: HTTP ${res.status}`);
            return new Uint8Array(await res.arrayBuffer());
          },
          { retries: 2, delayMs: 400, signal }
        ),
      handle,
      CONCURRENCY,
      (done) => onProgress(Math.min(done * CHUNK, total), total)
    );
    const secs = (Date.now() - started) / 1000;
    const mbps = secs > 0 ? ((total * 8) / 1e6 / secs).toFixed(1) : '0';
    console.log(
      `[chunked] ${(total / 1e6).toFixed(1)}MB in ${secs.toFixed(1)}s = ${mbps} Mbps`
    );
  } finally {
    handle.close();
  }
}
