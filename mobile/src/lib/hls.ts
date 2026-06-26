import { File, FileMode } from 'expo-file-system';
import { withRetry } from './retry';

// init (#EXT-X-MAP) + media segments, in playlist order
export function parseMediaPlaylist(text: string, baseUrl: string): string[] {
  const urls: string[] = [];
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    if (line.startsWith('#EXT-X-MAP:')) {
      const uri = line.match(/URI="([^"]+)"/u)?.[1];
      if (uri) urls.push(new URL(uri, baseUrl).toString());
    } else if (line && !line.startsWith('#')) {
      urls.push(new URL(line, baseUrl).toString());
    }
  }
  return urls;
}

/**
 * segments fetched concurrently, written in playlist order;
 * peak memory ~concurrency segments (not whole file).
 */
export async function downloadPlaylistToFile(
  playlistUrl: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (done: number, total: number) => void,
  concurrency = 4,
  signal?: AbortSignal
): Promise<{ segments: number; bytes: number }> {
  const res = await fetch(playlistUrl, { headers, signal });
  if (!res.ok) throw new Error(`playlist HTTP ${res.status}`);
  const urls = parseMediaPlaylist(await res.text(), playlistUrl);
  if (urls.length === 0) throw new Error('empty playlist');

  if (file.exists) file.delete();
  file.create();
  const handle = file.open(FileMode.WriteOnly);
  let bytes = 0;
  try {
    const ready = new Map<number, Uint8Array>();
    let nextWrite = 0;
    let nextFetch = 0;
    let inFlight = 0;
    await new Promise<void>((resolve, reject) => {
      let failed = false;
      const fail = (err: unknown): void => {
        if (failed) return;
        failed = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      const pump = (): void => {
        if (failed) return;
        while (ready.has(nextWrite)) {
          const buf = ready.get(nextWrite);
          ready.delete(nextWrite);
          if (buf) {
            handle.writeBytes(buf);
            bytes += buf.byteLength;
          }
          nextWrite += 1;
          onProgress(nextWrite, urls.length);
        }
        if (nextWrite >= urls.length) {
          resolve();
          return;
        }
        // cap outstanding -> peak memory ~concurrency segments
        while (
          inFlight < concurrency &&
          nextFetch < urls.length &&
          nextFetch - nextWrite < concurrency
        ) {
          const idx = nextFetch;
          nextFetch += 1;
          inFlight += 1;
          withRetry(
            async () => {
              const seg = await fetch(urls[idx], { headers, signal });
              if (seg.status >= 400)
                throw new Error(`segment HTTP ${seg.status}`);
              return new Uint8Array(await seg.arrayBuffer());
            },
            { retries: 2, delayMs: 400, signal }
          )
            .then((buf) => {
              ready.set(idx, buf);
              inFlight -= 1;
              pump();
            })
            .catch(fail);
        }
      };
      pump();
    });
  } finally {
    handle.close();
  }
  return { segments: urls.length, bytes };
}
