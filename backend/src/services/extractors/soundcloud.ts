import { Readable } from 'node:stream';
import { VideoInfo, ExtractorOptions } from '../../types/index.js';

let cachedClientId: string | null = null;
let lastClientIdFetch = 0;
const CLIENT_ID_EXPIRY = 3600000; // 1 hour

async function getClientId(): Promise<string | null> {
  if (cachedClientId && (Date.now() - lastClientIdFetch < CLIENT_ID_EXPIRY)) {
    return cachedClientId;
  }

  try {
    console.log('[SoundCloud] Fetching fresh client_id...');
    const response = await fetch('https://soundcloud.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await response.text();
    const scriptUrls = html.match(/src="([^"]+\/assets\/[^"]+\.js)"/g) || [];
    
    for (const scriptTag of scriptUrls.reverse()) {
      const match = scriptTag.match(/src="([^"]+)"/u);
      if (!match) continue;
      const url = match[1];
      const scriptRes = await fetch(url);
      const scriptBody = await scriptRes.text();
      const idMatch = scriptBody.match(/client_id:"([a-zA-Z0-9]{32})"/u);
      if (idMatch) {
        cachedClientId = idMatch[1];
        lastClientIdFetch = Date.now();
        console.log(`[SoundCloud] Found client_id: ${cachedClientId}`);
        return cachedClientId;
      }
    }
  } catch (e: unknown) {
    console.error('[SoundCloud] Failed to fetch client_id:', e instanceof Error ? e.message : String(e));
  }
  return cachedClientId;
}

export async function search(query: string): Promise<unknown[]> {
  const clientId = await getClientId();
  if (!clientId) return [];

  try {
    const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=5`;
    const response = await fetch(url);
    const { collection } = await response.json() as { collection?: unknown[] };
    return collection ?? [];
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error('[SoundCloud] Search error:', e.message);
    } else {
      console.error('[SoundCloud] Search error:', e);
    }
    return [];
  }
}

interface SoundCloudTranscoding {
  url: string;
  format: {
    protocol: string;
    mime_type: string;
  };
}

interface SoundCloudTrack {
  policy: string;
  duration: number;
  full_duration: number;
  title: string;
  media?: {
    transcodings?: SoundCloudTranscoding[];
  };
  id: string | number;
  user?: {
    username: string;
    avatar_url?: string;
  };
  artwork_url?: string;
}

export async function getInfo(url: string, _options: ExtractorOptions = {}): Promise<VideoInfo> {
  const clientId = await getClientId();
  if (!clientId) throw new Error('Could not obtain SoundCloud client_id');
  console.log(`[Metadata] Engine: Pure-JS | Platform: SoundCloud | URL: ${url}`);
  
  try {
    const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${clientId}`;
    const response = await fetch(resolveUrl);
    if (!response.ok) throw new Error(`Failed to resolve SoundCloud URL: ${response.status}`);
    const track = await response.json() as SoundCloudTrack;

    const isSnippet = track.policy === 'SNIPPET' || (track.duration < 60000 && track.full_duration > 60000);
    if (isSnippet) {
      console.warn(`[SoundCloud] Rejected snippet: ${track.title} (${(track.duration / 1000).toFixed(1)}s)`);
      throw new Error('This track is a preview snippet only.');
    }

    const transcoding = track.media?.transcodings?.find((t) => t.format.protocol === 'progressive') || 
                       track.media?.transcodings?.find((t) => t.format.protocol === 'hls');

    if (!transcoding) throw new Error('No supported stream found for this track');

    return {
      id: track.id.toString(),
      extractor_key: 'soundcloud',
      is_js_info: true,
      title: track.title,
      author: track.user?.username || 'Unknown',
      uploader: track.user?.username || 'Unknown',
      duration: track.duration / 1000,
      thumbnail: track.artwork_url || track.user?.avatar_url || '',
      webpage_url: url,
      formats: [
        {
          format_id: 'audio',
          url: transcoding.url,
          ext: 'mp3',
          resolution: 'audio',
          acodec: 'mp3',
          abr: 128,
          is_audio: true
        }
      ]
    };
  } catch (e: unknown) {
    console.error('[SoundCloud] getInfo error:', e instanceof Error ? e.message : String(e));
    throw e;
  }
}

export async function getStream(info: VideoInfo, _options: ExtractorOptions = {}): Promise<Readable> {
  const clientId = await getClientId();
  if (!clientId) throw new Error('Missing client_id');

  const format = info.formats[0];
  const streamAuthUrl = `${format.url}?client_id=${clientId}`;
  const response = await fetch(streamAuthUrl);
  const data = await response.json() as { url: string };
  const directUrl = data.url;

  const streamResponse = await fetch(directUrl);
  if (!streamResponse.body) throw new Error('No stream body');
  return Readable.fromWeb(streamResponse.body as import('node:stream/web').ReadableStream);
}
