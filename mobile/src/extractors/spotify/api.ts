const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

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
    const res = await fetch(TOKEN_URL, {
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
    const res = await fetch(`${API_BASE}/tracks/${trackId}`, {
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

interface OdesliResponse {
  entityUniqueId?: string;
  entitiesByUniqueId?: Record<
    string,
    { title?: string; artistName?: string; thumbnailUrl?: string }
  >;
  linksByPlatform?: Record<string, { url?: string }>;
}

export interface OdesliResult {
  title?: string;
  artist?: string;
  cover?: string;
  youtubeUrl?: string;
}

export async function fetchOdesli(
  trackId: string
): Promise<OdesliResult | null> {
  try {
    const target = encodeURIComponent(
      `https://open.spotify.com/track/${trackId}`
    );
    const res = await fetch(
      `https://api.song.link/v1-alpha.1/links?url=${target}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as OdesliResponse;
    const entity = data.entityUniqueId
      ? data.entitiesByUniqueId?.[data.entityUniqueId]
      : undefined;
    const youtubeUrl =
      data.linksByPlatform?.youtube?.url ||
      data.linksByPlatform?.youtubeMusic?.url;
    return {
      title: entity?.title,
      artist: entity?.artistName,
      cover: entity?.thumbnailUrl,
      youtubeUrl,
    };
  } catch {
    return null;
  }
}
