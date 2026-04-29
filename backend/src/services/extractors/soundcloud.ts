// @ts-nocheck
import {Readable} from 'node:stream';

let cachedClientId = null;
let lastClientIdFetch = 0;
const CLIENT_ID_EXPIRY = 3600000; // 1 hour

async function getClientId() {
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
      const url = scriptTag.match(/src="([^"]+)"/)[1];
      const scriptRes = await fetch(url);
      const scriptBody = await scriptRes.text();
      const idMatch = scriptBody.match(/client_id:"([a-zA-Z0-9]{32})"/);
      if (idMatch) {
        cachedClientId = idMatch[1];
        lastClientIdFetch = Date.now();
        console.log(`[SoundCloud] Found client_id: ${cachedClientId}`);
        return cachedClientId;
      }
    }
  } catch (e) {
    console.error('[SoundCloud] Failed to fetch client_id:', e.message);
  }
  return cachedClientId;
}

async function search(query) {
  const clientId = await getClientId();
  if (!clientId) return [];

  try {
    const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=5`;
    const response = await fetch(url);
    const data = await response.json();
    return data.collection || [];
  } catch (e) {
    console.error('[SoundCloud] Search error:', e.message);
    return [];
  }
}

async function getInfo(url) {
  const clientId = await getClientId();
  if (!clientId) throw new Error('Could not obtain SoundCloud client_id');

  try {
    const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${clientId}`;
    const response = await fetch(resolveUrl);
    if (!response.ok) throw new Error(`Failed to resolve SoundCloud URL: ${response.status}`);
    const track = await response.json();

    // reject snippets
    const isSnippet = track.policy === 'SNIPPET' || (track.duration < 60000 && track.full_duration > 60000);
    if (isSnippet) {
      console.warn(`[SoundCloud] Rejected snippet: ${track.title} (${(track.duration / 1000).toFixed(1)}s)`);
      throw new Error('This track is a preview snippet only.');
    }

    // find stream
    const transcoding = track.media?.transcodings?.find(t => t.format.protocol === 'progressive') || 
                       track.media?.transcodings?.find(t => t.format.protocol === 'hls');

    if (!transcoding) throw new Error('No supported stream found for this track');

    return {
      id: track.id,
      extractor_key: 'soundcloud',
      is_js_info: true,
      title: track.title,
      author: track.user?.username,
      uploader: track.user?.username,
      duration: track.duration / 1000,
      thumbnail: track.artwork_url || track.user?.avatar_url,
      streamUrl: transcoding.url,
      protocol: transcoding.format.protocol,
      formats: [
        {
          format_id: 'audio',
          ext: 'mp3',
          resolution: 'audio',
          acodec: 'mp3',
          abr: 128,
          is_audio: true
        }
      ]
    };
  } catch (e) {
    console.error('[SoundCloud] getInfo error:', e.message);
    throw e;
  }
}

export async function getStream(info) {
  const clientId = await getClientId();
  if (!clientId) throw new Error('Missing client_id');

  const streamAuthUrl = `${info.streamUrl}?client_id=${clientId}`;
  const response = await fetch(streamAuthUrl);
  const data = await response.json();
  const directUrl = data.url;

  if (info.protocol === 'hls') {
    // using HLS
    console.log('[SoundCloud] Using HLS stream:', directUrl);
  }

  const streamResponse = await fetch(directUrl);
  return Readable.fromWeb(streamResponse.body);
}

export { getInfo, search };
