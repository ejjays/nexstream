import { gatedFetch } from '../../lib/net';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_SECRET ?? '';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64(input: string): string {
  let output = '';
  let i = 0;
  while (i < input.length) {
    const chr1 = input.charCodeAt(i++);
    const chr2 = i < input.length ? input.charCodeAt(i++) : NaN;
    const chr3 = i < input.length ? input.charCodeAt(i++) : NaN;
    const enc1 = chr1 >> 2;
    const enc2 = ((chr1 & 3) << 4) | (Number.isNaN(chr2) ? 0 : chr2 >> 4);
    const enc3 = Number.isNaN(chr2)
      ? 64
      : ((chr2 & 15) << 2) | (Number.isNaN(chr3) ? 0 : chr3 >> 6);
    const enc4 = Number.isNaN(chr3) ? 64 : chr3 & 63;
    output +=
      B64[enc1] +
      B64[enc2] +
      (enc3 === 64 ? '=' : B64[enc3]) +
      (enc4 === 64 ? '=' : B64[enc4]);
  }
  return output;
}

export function parseTrackId(url: string): string | null {
  const match = url.match(/track[/:]([A-Za-z0-9]+)/u);
  return match ? match[1] : null;
}

export interface SpotifyTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover?: string;
  durationMs: number;
  isrc?: string;
}

interface SpotifyApiTrack {
  id: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  external_ids: { isrc?: string };
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  if (!CLIENT_ID || !CLIENT_SECRET) return null;
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const basic = base64(`${CLIENT_ID}:${CLIENT_SECRET}`);
  try {
    const res = await gatedFetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    tokenCache = {
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in - 60) * 1000,
    };
    return tokenCache.token;
  } catch {
    return null;
  }
}

export async function fetchSpotifyTrack(
  trackId: string
): Promise<SpotifyTrack | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await gatedFetch(`${API_BASE}/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const track = (await res.json()) as SpotifyApiTrack;
    return {
      id: track.id,
      title: track.name,
      artist: (track.artists || []).map((a) => a.name).join(', '),
      album: track.album?.name || '',
      cover: track.album?.images?.[0]?.url,
      durationMs: track.duration_ms || 0,
      isrc: track.external_ids?.isrc,
    };
  } catch {
    return null;
  }
}

export interface SpotifyEmbed {
  title?: string;
  artist?: string;
  cover?: string;
  durationMs?: number;
  isrc?: string;
}

type EmbedEntity = {
  name?: string;
  title?: string;
  artists?: Array<{ name?: string }>;
  subtitle?: string;
  duration?: number;
  duration_ms?: number;
  isrcCode?: string;
  external_ids?: { isrc?: string };
  coverArt?: { sources?: Array<{ url?: string }> };
  visualIdentity?: { image?: Array<{ url?: string }> };
  thumbnailUrl?: string;
};

const lastOf = <T>(arr?: T[]): T | undefined =>
  arr && arr.length > 0 ? arr[arr.length - 1] : undefined;

function mapEmbedEntity(entity: EmbedEntity | undefined): SpotifyEmbed | null {
  if (!entity) return null;
  const title = entity.name || entity.title;
  if (!title) return null;
  const artist =
    entity.artists?.[0]?.name ||
    (typeof entity.subtitle === 'string' ? entity.subtitle : undefined);
  const cover =
    lastOf(entity.coverArt?.sources)?.url ||
    lastOf(entity.visualIdentity?.image)?.url ||
    entity.thumbnailUrl;
  return {
    title,
    artist,
    cover,
    durationMs: entity.duration ?? entity.duration_ms ?? 0,
    isrc: entity.isrcCode || entity.external_ids?.isrc,
  };
}

// embed json sometimes ships url-encoded
function scriptJson(html: string, id: string): unknown {
  const match = html.match(
    new RegExp(`<script id="${id}"[^>]*>([\\s\\S]*?)</script>`, 'u')
  );
  if (!match) return null;
  const raw = match[1].trim();
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch {
      return null;
    }
  }
}

// credential-free metadata from the embed page json
export function parseEmbedHtml(html: string): SpotifyEmbed | null {
  const next = scriptJson(html, '__NEXT_DATA__') as {
    props?: { pageProps?: { state?: { data?: { entity?: EmbedEntity } } } };
  } | null;
  const fromNext = mapEmbedEntity(next?.props?.pageProps?.state?.data?.entity);
  if (fromNext) return fromNext;

  const resource = scriptJson(html, 'resource') as EmbedEntity | null;
  return mapEmbedEntity(resource ?? undefined);
}

// instant metadata without spotify credentials or the registry
export async function fetchSpotifyEmbed(
  trackId: string
): Promise<SpotifyEmbed | null> {
  try {
    const res = await gatedFetch(
      `https://open.spotify.com/embed/track/${trackId}`,
      {
        headers: {
          'User-Agent': DESKTOP_UA,
          'Accept-Language': 'en-US,en;q=0.9',
        },
      }
    );
    if (res.ok) {
      const parsed = parseEmbedHtml(await res.text());
      if (parsed?.title) return parsed;
    }
  } catch {
    /* fall back to oembed */
  }
  try {
    const target = encodeURIComponent(
      `https://open.spotify.com/track/${trackId}`
    );
    const res = await gatedFetch(
      `https://open.spotify.com/oembed?url=${target}`
    );
    if (res.ok) {
      const data = (await res.json()) as {
        title?: string;
        thumbnail_url?: string;
      };
      if (data.title) return { title: data.title, cover: data.thumbnail_url };
    }
  } catch {
    /* other sources cover it */
  }
  return null;
}

interface OdesliEntity {
  title?: string;
  artistName?: string;
  thumbnailUrl?: string;
  isrc?: string;
}

interface OdesliResponse {
  entityUniqueId?: string;
  entitiesByUniqueId?: Record<string, OdesliEntity>;
  linksByPlatform?: Record<string, { url?: string }>;
}

export interface OdesliResult {
  title?: string;
  artist?: string;
  cover?: string;
  isrc?: string;
  youtubeUrl?: string;
}

export async function fetchOdesli(
  trackId: string
): Promise<OdesliResult | null> {
  try {
    const target = encodeURIComponent(
      `https://open.spotify.com/track/${trackId}`
    );
    const res = await gatedFetch(
      `https://api.song.link/v1-alpha.1/links?url=${target}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as OdesliResponse;
    const entities = data.entitiesByUniqueId ?? {};
    const entity = data.entityUniqueId
      ? entities[data.entityUniqueId]
      : undefined;
    // canonical entity may lack isrc
    const isrc =
      entity?.isrc ?? Object.values(entities).find((item) => item?.isrc)?.isrc;
    const youtubeUrl =
      data.linksByPlatform?.youtube?.url ||
      data.linksByPlatform?.youtubeMusic?.url;
    return {
      title: entity?.title,
      artist: entity?.artistName,
      cover: entity?.thumbnailUrl,
      isrc,
      youtubeUrl,
    };
  } catch {
    return null;
  }
}
