import { HEADERS, DESKTOP_UA } from './constants';
import { gatedFetch } from '../../lib/net';
import { log } from '../../lib/log';

type FetchHtmlOptions = {
  cookie?: string;
};

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function fetchHtml(
  url: string,
  options: FetchHtmlOptions,
  timeoutMs = 10000
): Promise<{ html: string; targetUrl: string } | null> {
  const cookie = typeof options.cookie === 'string' ? options.cookie : null;
  const response = await gatedFetch(url, {
    headers: {
      ...HEADERS,
      ...(cookie && { Cookie: cookie }),
    },
    redirect: 'follow',
    signal: timeoutSignal(timeoutMs),
  });

  if (!response.ok) return null;
  const targetUrl = response.url || url;
  const html = await response.text();
  return { html, targetUrl };
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
    if (error instanceof Error) {
      log('fetcher', '[FacebookExtractor] Size fetch error:', error.message);
    } else {
      log('fetcher', '[FacebookExtractor] Size fetch error:', String(error));
    }
  }
  return undefined;
}
