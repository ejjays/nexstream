import { Readable } from 'node:stream';
import { request, type Dispatcher } from 'undici';
import { resolveAndValidateHost } from '../../utils/network/security.util.js';
import { USER_AGENT } from './config.js';

const CHUNK_SIZE = 8_000_000n;
const TRANSPLANT_DEBOUNCE = 3;
const MAX_TRANSPLANTS = 5;
const PREFLIGHT_HEAD_ATTEMPTS = 3;

const minBig = (x: bigint, y: bigint): bigint => (x < y ? x : y);

export interface UrlSource {
  url: string;
  headers?: Record<string, string>;
}

export interface ChunkedFetchOptions {
  urlProvider: () => Promise<UrlSource>;
  // re-resolves upstream URLs on 403
  transplant?: () => Promise<void>;
  controller?: AbortController;
  dispatcher?: Dispatcher;
  service?: string;
}

export interface ChunkedFetchResult {
  stream: Readable;
  size: bigint;
  contentType?: string;
}

function buildDefaultHeaders(service: string): Record<string, string> {
  const headers: Record<string, string> = {
    'user-agent': USER_AGENT,
    accept: '*/*',
  };
  if (service === 'youtube') {
    headers.referer = 'https://www.youtube.com/';
    headers.origin = 'https://www.youtube.com';
  }
  return headers;
}

async function preflightHead(
  opts: ChunkedFetchOptions,
  controller: AbortController
): Promise<{ url: string; size: bigint; contentType?: string }> {
  const defaults = buildDefaultHeaders(opts.service || 'youtube');
  let attempts = PREFLIGHT_HEAD_ATTEMPTS;
  let lastUrl = '';

  while (attempts-- > 0) {
    const { url, headers } = await opts.urlProvider();
    lastUrl = url;
    // ssrf guard mirrors getQuantumStream
    await resolveAndValidateHost(new URL(url).hostname);

    const response = await request(url, {
      method: 'HEAD',
      headers: { ...defaults, ...(headers || {}) },
      dispatcher: opts.dispatcher,
      signal: controller.signal,
    });
    response.body.on('data', () => {}).on('error', () => {});

    if (response.statusCode === 403 && opts.transplant) {
      try {
        await opts.transplant();
        continue;
      } catch {
        break;
      }
    }

    if (response.statusCode === 200) {
      const len = response.headers['content-length'];
      const ct = response.headers['content-type'];
      const size = typeof len === 'string' ? BigInt(len) : 0n;
      const contentType = typeof ct === 'string' ? ct : undefined;
      return { url, size, contentType };
    }

    break;
  }

  throw new Error(
    `chunked-fetcher: pre-flight HEAD failed (last url=${lastUrl.substring(0, 80)})`
  );
}

async function* readChunks(
  opts: ChunkedFetchOptions,
  size: bigint,
  controller: AbortController
): AsyncGenerator<Buffer> {
  const defaults = buildDefaultHeaders(opts.service || 'youtube');
  let read = 0n;
  let chunksSinceTransplant = 0;
  let transplantCount = 0;
  // coalesce concurrent transplants
  let pendingTransplant: Promise<void> | null = null;

  while (read < size) {
    if (controller.signal.aborted) {
      throw new Error('chunked-fetcher: aborted');
    }

    const { url, headers } = await opts.urlProvider();
    const rangeEnd = read + CHUNK_SIZE;

    const response = await request(url, {
      method: 'GET',
      headers: {
        ...defaults,
        ...(headers || {}),
        range: `bytes=${read}-${rangeEnd}`,
      },
      dispatcher: opts.dispatcher,
      signal: controller.signal,
    });

    if (
      response.statusCode === 403 &&
      chunksSinceTransplant >= TRANSPLANT_DEBOUNCE &&
      opts.transplant
    ) {
      // stop re-resolving on persistent 403
      if (++transplantCount > MAX_TRANSPLANTS) {
        controller.abort();
        throw new Error(
          'chunked-fetcher: transplant limit reached (persistent 403)'
        );
      }
      chunksSinceTransplant = 0;
      response.body.on('data', () => {}).on('error', () => {});

      try {
        if (!pendingTransplant) {
          pendingTransplant = opts.transplant();
        }
        await pendingTransplant;
      } catch {
        // next debounce window will retry
      } finally {
        pendingTransplant = null;
      }
      continue;
    }

    chunksSinceTransplant++;

    const expected = minBig(CHUNK_SIZE, size - read);
    const lenHeader = response.headers['content-length'];
    const received =
      typeof lenHeader === 'string' ? BigInt(lenHeader) : expected;

    // truncated chunk = throttle or malformed
    if (received < expected / 2n) {
      controller.abort();
      throw new Error(
        `chunked-fetcher: truncated chunk (got ${received}, expected ~${expected})`
      );
    }

    for await (const data of response.body) {
      yield data as Buffer;
    }

    read += received;
  }
}

// 8MB Range chunks with transplant on 403.
// urlProvider stays swappable for SABR.
export async function fetchChunked(
  opts: ChunkedFetchOptions
): Promise<ChunkedFetchResult> {
  const controller = opts.controller || new AbortController();
  const { size, contentType } = await preflightHead(opts, controller);

  if (size <= 0n) {
    throw new Error('chunked-fetcher: pre-flight returned zero size');
  }

  const generator = readChunks(opts, size, controller);

  const onAbort = () => {
    generator.return(undefined as unknown as Buffer).catch(() => {});
  };
  controller.signal.addEventListener('abort', onAbort, { once: true });

  const stream = Readable.from(generator);
  stream.once('close', () => {
    controller.signal.removeEventListener('abort', onAbort);
    if (!controller.signal.aborted) controller.abort();
  });

  return { stream, size, contentType };
}

// exported for test harness only
export const _internals = {
  CHUNK_SIZE,
  TRANSPLANT_DEBOUNCE,
  PREFLIGHT_HEAD_ATTEMPTS,
  buildDefaultHeaders,
  readChunks,
  preflightHead,
};
