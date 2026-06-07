import { ProxyAgent, type Dispatcher } from 'undici';

// experimental: route youtube egress via residential proxy
// off unless YT_PROXY is set
export const YT_PROXY = process.env.YT_PROXY?.trim() || '';

// opt-in: proxy all platforms not just youtube
const PROXY_ALL = process.env.YT_PROXY_ALL === '1';

export function isYouTubeUrl(url?: string): boolean {
  if (!url) return false;
  return url.includes('youtube.com') || url.includes('youtu.be');
}

// should this url's egress be proxied
export function shouldProxyUrl(url?: string): boolean {
  if (!YT_PROXY) return false;
  return PROXY_ALL || isYouTubeUrl(url);
}

// --proxy args; youtube-only unless YT_PROXY_ALL
export function ytProxyArgs(url?: string): string[] {
  if (!YT_PROXY) return [];
  if (!PROXY_ALL && url !== undefined && !isYouTubeUrl(url)) return [];
  return ['--proxy', YT_PROXY];
}

let dispatcherResolved = false;
let cachedDispatcher: Dispatcher | undefined;

// dispatcher for chunked media
export function ytProxyDispatcher(): Dispatcher | undefined {
  if (!YT_PROXY) return undefined;
  if (!dispatcherResolved) {
    dispatcherResolved = true;
    if (/^https?:\/\//u.test(YT_PROXY)) {
      cachedDispatcher = new ProxyAgent(YT_PROXY);
    } else {
      // undici needs http(s) proxy
      console.warn(
        `[YT_PROXY] media fetch needs http(s) proxy; got ${YT_PROXY.split('://')[0]}://`
      );
    }
  }
  return cachedDispatcher;
}
