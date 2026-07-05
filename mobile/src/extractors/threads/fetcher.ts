import { HEADERS, DESKTOP_UA } from './constants';
import { gatedFetch } from '../../lib/net';
import { log } from '../../lib/log';

type FetchOptions = {
  cookie?: string;
};

type FetchResult = { html: string; targetUrl: string };

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

// public embed endpoint, often ungated
function buildEmbedUrl(url: string): string {
  const clean = url.split('?')[0].replace(/\/+$/u, '');
  return `${clean}/embed`;
}

async function fetchPage(
  target: string,
  options: FetchOptions
): Promise<FetchResult | null> {
  const cookie = typeof options.cookie === 'string' ? options.cookie : null;
  const response = await gatedFetch(target, {
    headers: {
      ...HEADERS,
      ...(cookie && { Cookie: cookie }),
    },
    redirect: 'follow',
    signal: timeoutSignal(10000),
  });
  if (!response.ok) return null;
  return { html: await response.text(), targetUrl: response.url || target };
}

export function fetchHtml(
  url: string,
  options: FetchOptions
): Promise<FetchResult | null> {
  return fetchPage(url, options);
}

export function fetchEmbed(
  url: string,
  options: FetchOptions
): Promise<FetchResult | null> {
  return fetchPage(buildEmbedUrl(url), options);
}

export async function fetchFileSize(url: string): Promise<number | undefined> {
  try {
    const headResponse = await gatedFetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': DESKTOP_UA },
      redirect: 'follow',
      signal: timeoutSignal(5000),
    });
    if (headResponse.ok) {
      const contentLength = headResponse.headers.get('content-length');
      if (contentLength) return parseInt(contentLength, 10);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log('fetcher', '[ThreadsExtractor] Size fetch error:', message);
  }
  return undefined;
}
