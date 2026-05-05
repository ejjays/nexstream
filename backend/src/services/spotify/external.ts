import { isValidSpotifyUrl } from "../../utils/validation.util.js";

interface DeezerTrack {
  id: number;
  title: string;
  duration: number;
  preview: string;
  isrc?: string;
  artist: {
    name: string;
  };
}

interface DeezerSearchResponse {
  data: DeezerTrack[];
  total: number;
}

interface ExternalLookupResult {
  isrc: string | null;
  preview: string | null;
}

async function searchDeezer(query: string): Promise<DeezerSearchResponse> {
  const res = await fetch(
    `https://api.deezer.com/search?q=${encodeURIComponent(query)}`,
  );
  return res.json();
}

export async function fetchIsrcFromDeezer(
  title: string,
  artist: string,
  isrc: string | null = null,
  targetDurationMs: number = 0,
): Promise<ExternalLookupResult | null> {
  try {
    if (isrc) {
      const res = await fetch(`https://api.deezer.com/track/isrc:${isrc}`);
      const data: any = await res.json();
      if (data && !data.error && data.preview) {
        return { isrc: data.isrc || isrc, preview: data.preview };
      }
    }
    let searchData = await searchDeezer(`artist:"${artist}" track:"${title}"`);
    if (!searchData.data?.length)
      searchData = await searchDeezer(`${title} ${artist}`);
    const cleanTitle = title.replace(/\s*[\[(].*?[\)\]]/g, "").trim();
    if (!searchData.data?.length && cleanTitle !== title)
      searchData = await searchDeezer(`${cleanTitle} ${artist}`);

    if (searchData.data?.length) {
      const best =
        searchData.data.find((t) => {
          const artistMatch =
            t.artist.name.toLowerCase().includes(artist.toLowerCase()) ||
            artist.toLowerCase().includes(t.artist.name.toLowerCase());
          const isTargetValid = targetDurationMs > 30000;
          const durationMatch = isTargetValid
              ? Math.abs(t.duration * 1000 - targetDurationMs) < 10000
              : true;
          return artistMatch && durationMatch;
        }) || searchData.data[0];

      if (
        targetDurationMs > 30000 &&
        Math.abs(best.duration * 1000 - targetDurationMs) > 20000
      )
        return null;

      const detailRes = await fetch(`https://api.deezer.com/track/${best.id}`);
      const detailData: any = await detailRes.json();
      return { isrc: detailData.isrc || null, preview: best.preview || null };
    }
  } catch (err: any) { console.debug('[SpotifyExternal] Deezer error:', err.message); }
  return null;
}

interface ItunesResult {
  trackTimeMillis: number;
  isrc?: string;
  previewUrl?: string;
}

interface ItunesResponse {
  results: ItunesResult[];
}

export async function fetchIsrcFromItunes(
  title: string,
  artist: string,
  isrc: string | null = null,
  targetDurationMs: number = 0,
): Promise<ExternalLookupResult | null> {
  try {
    const query = isrc || `${title} ${artist}`;
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&limit=5&entity=song`,
    );
    const data: ItunesResponse = await res.json();
    if (data.results?.length) {
      const isTargetValid = targetDurationMs > 30000;
      const best = isTargetValid
          ? data.results.sort(
              (a, b) =>
                Math.abs(a.trackTimeMillis - targetDurationMs) -
                Math.abs(b.trackTimeMillis - targetDurationMs),
            )[0]
          : data.results[0];
          
      if (
        isTargetValid &&
        Math.abs(best.trackTimeMillis - targetDurationMs) > 20000
      )
        return null;
      return { isrc: best.isrc || null, preview: best.previewUrl || null };
    }
  } catch (err: any) { console.debug('[SpotifyExternal] iTunes error:', err.message); }
  return null;
}

interface OdesliEntity {
  title?: string;
  artistName?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  isrc?: string;
  platforms?: string[];
}

interface OdesliResponse {
  entitiesByUniqueId: Record<string, OdesliEntity>;
  linksByPlatform: Record<string, { url: string; entityUniqueId: string }>;
  entityUniqueId: string;
}

export interface OdesliResult {
  id?: string;
  targetUrl: string | null;
  title: string;
  artist: string;
  thumbnailUrl: string;
  duration: number;
  isrc: string | null;
  source: string;
}

export async function fetchFromOdesli(spotifyUrl: string): Promise<OdesliResult | null> {
  if (!isValidSpotifyUrl(spotifyUrl)) return null;
  try {
    const parsed = new URL(spotifyUrl);
    const res = await fetch(
      `https://api.odesli.co/v1-alpha.1/links?url=${encodeURIComponent(`${parsed.protocol}//${parsed.hostname}${parsed.pathname}${parsed.search}`)}`,
    );
    if (!res.ok) return null;
    const data: OdesliResponse = await res.json();
    
    const spotifyEntity = Object.values(data.entitiesByUniqueId).find((e) => e.platforms?.includes('spotify'));

    const youtubeLink =
      data.linksByPlatform?.youtube?.url ||
      data.linksByPlatform?.youtubeMusic?.url;
      
    if (!youtubeLink && !spotifyEntity) return null;
    
    const entity =
      data.entitiesByUniqueId[
        data.linksByPlatform?.youtube?.entityUniqueId ||
          data.linksByPlatform?.youtubeMusic?.entityUniqueId ||
          data.entityUniqueId
      ];
      
    return {
      targetUrl: youtubeLink || null,
      title: entity?.title || spotifyEntity?.title || "Unknown Title",
      artist: entity?.artistName || spotifyEntity?.artistName || "Unknown Artist",
      thumbnailUrl: entity?.thumbnailUrl || spotifyEntity?.thumbnailUrl || "",
      duration: (spotifyEntity?.durationSeconds || 0) * 1000,
      isrc: spotifyEntity?.isrc || null,
      source: "odesli"
    };
  } catch (err) {
    return null;
  }
}
