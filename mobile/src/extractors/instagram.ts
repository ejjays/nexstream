import { VideoInfo, Format } from './types';

const IG_APP_ID = '936619743392459';
const POST_DOC_ID = '8845758582119845';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const REFERER = 'https://www.instagram.com/';

const WEB_HEADERS: Record<string, string> = {
  'User-Agent': DESKTOP_UA,
  'x-ig-app-id': IG_APP_ID,
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Site': 'same-origin',
};
const PAGE_HEADERS: Record<string, string> = {
  'User-Agent': DESKTOP_UA,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
};

interface IgMedia {
  url: string;
  isVideo: boolean;
  width?: number;
  height?: number;
  muxAudioUrl?: string;
  isMuxed?: boolean;
  formatId?: string;
  quality?: string;
}
interface IgParsed {
  id: string | null;
  title: string;
  uploader: string;
  thumbnail?: string;
  media: IgMedia[];
}
interface GqlNode {
  shortcode?: string;
  id?: string;
  video_url?: string;
  display_url?: string;
  dimensions?: { width?: number; height?: number };
  dash_info?: { video_dash_manifest?: string };
  edge_media_to_caption?: { edges?: Array<{ node?: { text?: string } }> };
  owner?: { full_name?: string; username?: string };
  edge_sidecar_to_children?: { edges?: Array<{ node?: GqlNode }> };
}

// shortcode from any post/reel/tv url
function extractShortcode(url: string): string | null {
  const match = url.match(/\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/u);
  return match ? match[1] : null;
}

function objFrom(name: string, html: string): Record<string, unknown> | null {
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

function numQ(name: string, html: string): string | null {
  const match = html.match(new RegExp(`${name}=(\\d+)`, 'u'));
  return match ? match[1] : null;
}

function randomToken(): string {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  );
}

// harvest page tokens, then web graphql
async function fetchGraphqlMedia(shortcode: string): Promise<GqlNode | null> {
  const pageRes = await fetch(`https://www.instagram.com/p/${shortcode}/`, {
    headers: PAGE_HEADERS,
  });
  if (!pageRes.ok) return null;
  const html = await pageRes.text();

  const lsd = (objFrom('LSD', html)?.token as string) || randomToken();
  const csrf = objFrom('InstagramSecurityConfig', html)?.csrf_token as
    | string
    | undefined;
  const webConfig = objFrom('DGWWebConfig', html) ?? {};
  const siteData = objFrom('SiteData', html) ?? {};

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
    __comet_req: numQ('__comet_req', html) || '7',
    lsd,
    jazoest: numQ('jazoest', html) || '2',
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
    ...WEB_HEADERS,
    'x-ig-app-id': (webConfig.appId as string) || IG_APP_ID,
    'X-FB-LSD': lsd,
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-FB-Friendly-Name': 'PolarisPostActionLoadPostQueryQuery',
  };
  if (csrf) headers['X-CSRFToken'] = csrf;

  const res = await fetch('https://www.instagram.com/graphql/query', {
    method: 'POST',
    headers,
    body: body.toString(),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: { xdt_shortcode_media?: GqlNode; shortcode_media?: GqlNode };
  };
  return json?.data?.xdt_shortcode_media ?? json?.data?.shortcode_media ?? null;
}

function mediaFromGql(node: GqlNode | undefined): IgMedia | null {
  if (!node) return null;
  if (node.video_url) {
    return {
      url: node.video_url,
      isVideo: true,
      width: node.dimensions?.width,
      height: node.dimensions?.height,
    };
  }
  if (node.display_url) {
    return {
      url: node.display_url,
      isVideo: false,
      width: node.dimensions?.width,
      height: node.dimensions?.height,
    };
  }
  return null;
}

interface DashVideo {
  url: string;
  width: number;
  height: number;
}

// dash video reps + best audio
export function parseDashManifest(manifest: string): {
  videos: DashVideo[];
  audioUrl?: string;
} {
  const videos: DashVideo[] = [];
  let audioUrl: string | undefined;
  let bestAudioBw = -1;
  for (const rep of manifest.matchAll(
    /<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/gu
  )) {
    const attrs = rep[1];
    const baseMatch = rep[2].match(/<BaseURL>([^<]+)<\/BaseURL>/u);
    if (!baseMatch) continue;
    const url = baseMatch[1].trim().replace(/&amp;/gu, '&');
    const width = Number(attrs.match(/\bwidth="(\d+)"/u)?.[1] ?? 0);
    const height = Number(attrs.match(/\bheight="(\d+)"/u)?.[1] ?? 0);
    const isAudio = /mimeType="audio/u.test(attrs) || (!width && !height);
    if (isAudio) {
      const bandwidth = Number(attrs.match(/\bbandwidth="(\d+)"/u)?.[1] ?? 0);
      if (bandwidth > bestAudioBw) {
        bestAudioBw = bandwidth;
        audioUrl = url;
      }
    } else if (width && height) {
      videos.push({ url, width, height });
    }
  }
  const seen = new Set<string>();
  const deduped = videos.filter((video) => {
    const key = `${video.width}x${video.height}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { videos: deduped, audioUrl };
}

// dash gives video-only variants needing mux
function singleVideoMedia(node: GqlNode): IgMedia[] {
  const base = mediaFromGql(node);
  if (!base) return [];
  if (!base.isVideo) return [base];

  const manifest = node.dash_info?.video_dash_manifest;
  const dash = manifest ? parseDashManifest(manifest) : null;
  if (!dash || dash.videos.length === 0 || !dash.audioUrl) return [base];

  const list: IgMedia[] = dash.videos.map((video) => {
    const short = Math.min(video.width, video.height);
    return {
      url: video.url,
      isVideo: true,
      width: video.width,
      height: video.height,
      muxAudioUrl: dash.audioUrl,
      isMuxed: false,
      formatId: `${short}p`,
      quality: `${short}p`,
    };
  });
  const pShort =
    base.width && base.height ? Math.min(base.width, base.height) : 0;
  list.push({
    ...base,
    isMuxed: true,
    formatId: pShort ? `${pShort}p_progressive` : 'sd',
    quality: pShort ? `${pShort}p` : 'SD',
  });
  list.sort(
    (lhs, rhs) =>
      (rhs.width ?? 0) * (rhs.height ?? 0) -
      (lhs.width ?? 0) * (lhs.height ?? 0)
  );
  const seen = new Set<string>();
  return list.filter((entry) => {
    const key = entry.formatId as string;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseGraphqlMedia(node: GqlNode | null): IgParsed | null {
  if (!node) return null;
  const sidecar = node.edge_sidecar_to_children?.edges;
  const media: IgMedia[] = Array.isArray(sidecar)
    ? (sidecar
        .map((edge) => mediaFromGql(edge?.node))
        .filter(Boolean) as IgMedia[])
    : singleVideoMedia(node);
  if (media.length === 0) return null;
  return {
    id: node.shortcode || node.id || null,
    title:
      node.edge_media_to_caption?.edges?.[0]?.node?.text || 'Instagram Post',
    uploader: node.owner?.full_name || node.owner?.username || 'Instagram User',
    thumbnail: node.display_url,
    media,
  };
}

function toFormat(media: IgMedia, index: number, total: number): Format {
  const dims =
    media.width && media.height ? `${media.width}x${media.height}` : undefined;
  const prefix = total > 1 ? `item${index + 1}_` : '';

  if (media.isVideo) {
    // progressive carries its own audio
    const muxed = media.isMuxed !== false;
    return {
      formatId: media.formatId ?? `${prefix}hd`,
      url: media.url,
      extension: 'mp4',
      resolution: dims ?? 'Source',
      quality: media.quality ?? (total > 1 ? `Item ${index + 1}` : 'HD'),
      width: media.width,
      height: media.height,
      vcodec: 'h264',
      acodec: 'aac',
      isVideo: true,
      isAudio: false,
      isMuxed: muxed,
      muxAudioUrl: muxed ? undefined : media.muxAudioUrl,
      muxAudioExt: muxed ? undefined : 'm4a',
    };
  }

  return {
    formatId: media.formatId ?? `${prefix}photo`,
    url: media.url,
    extension: 'jpg',
    resolution: dims ?? 'Photo',
    quality: media.quality ?? (total > 1 ? `Item ${index + 1}` : 'Photo'),
    width: media.width,
    height: media.height,
    vcodec: 'none',
    acodec: 'none',
    isVideo: false,
    isAudio: false,
    isMuxed: false,
  };
}

// size via 1-byte range probe
async function fetchSize(url: string): Promise<number | undefined> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': DESKTOP_UA,
        Referer: REFERER,
        Range: 'bytes=0-0',
      },
    });
    const range = res.headers.get('content-range');
    const match = range ? /\/(\d+)\s*$/u.exec(range) : null;
    if (match) return parseInt(match[1], 10);
    const len = res.headers.get('content-length');
    return len ? parseInt(len, 10) : undefined;
  } catch {
    return undefined;
  }
}

export async function getInfo(url: string): Promise<VideoInfo | null> {
  try {
    const shortcode = extractShortcode(url);
    if (!shortcode) return null;

    const node = await fetchGraphqlMedia(shortcode);
    const parsed = parseGraphqlMedia(node);
    if (!parsed || parsed.media.length === 0) return null;

    const total = parsed.media.length;
    const formats = parsed.media.map((media, index) =>
      toFormat(media, index, total)
    );

    await Promise.all(
      formats.map(async (format) => {
        const size = await fetchSize(format.url);
        if (size) format.filesize = size;
      })
    );

    return {
      type: 'video',
      id: parsed.id || url,
      title: parsed.title || 'Instagram Video',
      uploader: parsed.uploader || 'Instagram User',
      webpageUrl: url,
      thumbnail: parsed.thumbnail,
      formats,
      extractorKey: 'instagram',
      isJsInfo: true,
      fromBrain: false,
      isPartial: false,
      isIsrcMatch: false,
      isFullData: true,
      downloadHeaders: {
        'User-Agent': DESKTOP_UA,
        Referer: REFERER,
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        Range: 'bytes=0-',
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[JS-IG] Error extracting ${url}: ${message}`);
    return null;
  }
}
