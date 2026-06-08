import { secureFetch } from '../../../utils/network/security.util.js';
import { randomBytes } from 'node:crypto';
import { ExtractorOptions } from '../../../types/index.js';
import {
  WEB_HEADERS,
  MOBILE_HEADERS,
  EMBED_HEADERS,
  IG_APP_ID,
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

// scrape a bootstrap blob from html
function objectFromEntries(
  name: string,
  html: string
): Record<string, unknown> | null {
  const match = html.match(
    new RegExp(`\\["${name}",.*?,(\\{.*?\\}),\\d+\\]`, 'u')
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function numberFromQuery(name: string, html: string): string | null {
  const match = html.match(new RegExp(`${name}=(\\d+)`, 'u'));
  return match ? match[1] : null;
}

// web graphql via harvested page tokens
export async function fetchGraphqlMedia(
  shortcode: string,
  options: ExtractorOptions
): Promise<unknown> {
  // harvest lsd/csrf/appId from the post page first
  const pageResponse = await secureFetch(
    `https://www.instagram.com/p/${shortcode}/`,
    {
      headers: withCookie(EMBED_HEADERS, options),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );
  if (!pageResponse.ok) return null;
  const html = await pageResponse.text();

  const lsd =
    (objectFromEntries('LSD', html)?.token as string) ||
    randomBytes(8).toString('base64url');
  const csrf = objectFromEntries('InstagramSecurityConfig', html)
    ?.csrf_token as string | undefined;
  const webConfig = objectFromEntries('DGWWebConfig', html) ?? {};
  const siteData = objectFromEntries('SiteData', html) ?? {};

  const body = new URLSearchParams({
    __d: 'www',
    __a: '1',
    __req: 'b',
    __hs:
      (siteData.haste_session as string) ||
      '20126.HYP:instagram_web_pkg.2.1...0',
    __ccg: 'EXCELLENT',
    __rev: '1019933358',
    dpr: '2',
    __comet_req: numberFromQuery('__comet_req', html) || '7',
    lsd,
    jazoest: numberFromQuery('jazoest', html) || '2',
    __spin_r: '1019933358',
    __spin_b: 'trunk',
    __spin_t: '1',
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'PolarisPostActionLoadPostQueryQuery',
    variables: JSON.stringify({
      shortcode,
      fetch_tagged_user_count: null,
      hoisted_comment_id: null,
      hoisted_reply_id: null,
    }),
    server_timestamps: 'true',
    doc_id: POST_DOC_ID,
  });

  const headers: Record<string, string> = {
    ...withCookie(WEB_HEADERS, options),
    'x-ig-app-id': (webConfig.appId as string) || IG_APP_ID,
    'X-FB-LSD': lsd,
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-FB-Friendly-Name': 'PolarisPostActionLoadPostQueryQuery',
  };
  if (csrf) headers['X-CSRFToken'] = csrf;

  const response = await secureFetch(
    'https://www.instagram.com/graphql/query',
    {
      method: 'POST',
      headers,
      body: body.toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );
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
