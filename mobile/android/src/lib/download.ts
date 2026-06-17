import { File, FileMode } from 'expo-file-system';

/* ranged chunks dodge cdn throttle */
const CHUNK = 8_000_000;

export async function chunkedDownload(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (written: number, total: number) => void
): Promise<void> {
  const head = await fetch(url, { headers: { ...headers, Range: 'bytes=0-0' } });
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
  try {
    let read = 0;
    while (read < total) {
      const end = Math.min(read + CHUNK, total - 1);
      const res = await fetch(url, {
        headers: { ...headers, Range: `bytes=${read}-${end}` },
      });
      if (res.status >= 400) throw new Error(`chunked: HTTP ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength === 0) break;
      handle.writeBytes(buf);
      read += buf.byteLength;
      onProgress(read, total);
    }
  } finally {
    handle.close();
  }
}
