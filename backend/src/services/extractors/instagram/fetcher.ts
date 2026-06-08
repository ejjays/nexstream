import { secureFetch } from '../../../utils/network/security.util.js';
import { ExtractorOptions } from '../../../types/index.js';
import {
  WEB_HEADERS,
  MOBILE_HEADERS,
  EMBED_HEADERS,
  POST_DOC_ID,
} from './constants.js';

const TIMEOUT_MS = 10000;

// pull shortcode from any post/reel/tv url
export function extractShortcode(url: string): string | null {
  const match = url.match(/\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/u);
  return match ? match[1] : null;
}

function withCookie(
  headers: Record<string, string>,
  options: ExtractorOptions
): Record<string, string> {
  const cookie = typeof options.cookie === 'string' ? options.cookie : null;
  return cookie ? { ...headers, Cookie: cookie } : headers;
}

// oembed maps shortcode to numeric media id
async function fetchMediaId(
  shortcode: string,
  options: ExtractorOptions
): Promise<string | null> {
  const oembedUrl = `https://i.instagram.com/api/v1/oembed/?url=https://www.instagram.com/p/${shortcode}/`;
  const response = await secureFetch(oembedUrl, {
    headers: withCookie(MOBILE_HEADERS, options),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { media_id?: string };
  return data?.media_id ?? null;
}

// primary path, mobile private api
export async function fetchMobileItem(
  shortcode: string,
  options: ExtractorOptions
): Promise<unknown> {
  const mediaId = await fetchMediaId(shortcode, options);
  if (!mediaId) return null;

  const response = await secureFetch(
    `https://i.instagram.com/api/v1/media/${mediaId}/info/`,
    {
      headers: withCookie(MOBILE_HEADERS, options),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { items?: unknown[] };
  return data?.items?.[0] ?? null;
}

// secondary path, web graphql
export async function fetchGraphqlMedia(
  shortcode: string,
  options: ExtractorOptions
): Promise<unknown> {
  const body = new URLSearchParams({
    doc_id: POST_DOC_ID,
    variables: JSON.stringify({ shortcode }),
  });

  const response = await secureFetch('https://www.instagram.com/graphql/query', {
    method: 'POST',
    headers: {
      ...withCookie(WEB_HEADERS, options),
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-FB-Friendly-Name': 'PolarisPostActionLoadPostQueryQuery',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const json = (await response.json()) as {
    data?: { xdt_shortcode_media?: unknown; shortcode_media?: unknown };
  };
  return json?.data?.xdt_shortcode_media ?? json?.data?.shortcode_media ?? null;
}

// last resort, captioned embed html
export async function fetchEmbedHtml(
  url: string,
  options: ExtractorOptions
): Promise<string | null> {
  const base = url.split('?')[0].replace(/\/?$/u, '/');
  const response = await secureFetch(`${base}embed/captioned/`, {
    headers: withCookie(EMBED_HEADERS, options),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return await response.text();
}

export async function fetchFileSize(url: string): Promise<number | undefined> {
  try {
    const response = await secureFetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': WEB_HEADERS['User-Agent'] },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const len = response.headers.get('content-length');
      if (len) return parseInt(len, 10);
    }
  } catch (error: unknown) {
    console.debug(`[Instagram] Size fetch failed: ${(error as Error).message}`);
  }
  return undefined;
}
