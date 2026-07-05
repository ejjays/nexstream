const KEY = (process.env.EXPO_PUBLIC_GIPHY_KEY ?? '').trim();
const BASE = 'https://api.giphy.com/v1/gifs';

export const isGiphyConfigured = KEY.length > 0;

export type Gif = {
  id: string;
  preview: string;
  url: string;
  aspect: number;
};

type GiphyImage = { url?: string; width?: string; height?: string };
type GiphyResult = {
  id: string;
  images?: { [key: string]: GiphyImage | undefined };
};

function normalize(results: GiphyResult[]): Gif[] {
  const out: Gif[] = [];
  for (const item of results) {
    const images = item.images ?? {};
    // fixed_width = grid thumbnail, downsized_medium = capped full for the comment
    const preview = images.fixed_width;
    const full = images.downsized_medium ?? images.downsized ?? preview;
    if (!preview?.url || !full?.url) continue;
    const dw = Number(preview.width) || 1;
    const dh = Number(preview.height) || 1;
    out.push({
      id: item.id,
      preview: preview.url,
      url: full.url,
      aspect: dw > 0 && dh > 0 ? dw / dh : 1,
    });
  }
  return out;
}

async function fetchGifs(
  endpoint: string,
  extra: string,
  signal?: AbortSignal
): Promise<Gif[]> {
  if (!isGiphyConfigured) return [];
  // rating=g keeps results SFW; messaging bundle for chat-sized renditions
  const url =
    `${BASE}/${endpoint}?api_key=${encodeURIComponent(KEY)}` +
    `&limit=24&rating=g&bundle=messaging_non_clips${extra}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`giphy ${res.status}`);
  const json = (await res.json()) as { data?: GiphyResult[] };
  return normalize(json.data ?? []);
}

export function trendingGifs(signal?: AbortSignal): Promise<Gif[]> {
  return fetchGifs('trending', '', signal);
}

export function searchGifs(query: string, signal?: AbortSignal): Promise<Gif[]> {
  const term = query.trim();
  if (term.length === 0) return trendingGifs(signal);
  return fetchGifs('search', `&q=${encodeURIComponent(term)}`, signal);
}
