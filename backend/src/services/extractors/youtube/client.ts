import { Innertube, UniversalCache } from 'youtubei.js';

let cachedClient: Innertube | null = null;

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const _createInnertube = async (config?: any): Promise<Innertube> => {
  return await Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: true,
    ...config,
  });
};

export async function getYoutubeClient(): Promise<Innertube> {
  if (cachedClient) return cachedClient;

  try {
    cachedClient = await _createInnertube();
    return cachedClient;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[YouTubeClient] Init failed: ${message}`);
    throw error;
  }
}
