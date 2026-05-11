import { describe, it, expect, vi } from 'vitest';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { VideoInfo } from '../src/types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

// mock resolveSpotifyToYoutube so no real yt-dlp search is performed
vi.mock('../src/services/spotify/index.js', () => ({
  resolveSpotifyToYoutube: vi.fn().mockResolvedValue({
    targetUrl: 'https://www.youtube.com/watch?v=nTbA7qrEsP0',
    title: 'Awit Ng Bayan (Mocked)',
    artist: 'Victory Worship',
    isrc: 'FR2X41721331',
    previewUrl: 'https://p.scdn.co/mp3-preview/mocked',
    cover: 'https://example.com/cover.jpg',
    imageUrl: 'https://example.com/cover.jpg',
    album: 'Awit Ng Bayan',
    duration: 338000,
    fromBrain: false,
    formats: []
  }),
  refreshPreviewIfNeeded: vi.fn().mockResolvedValue(undefined),
  saveToBrain: vi.fn().mockResolvedValue(undefined),
  fetchIsrcFromDeezer: vi.fn().mockResolvedValue(null),
}));

// mock the YouTube extractor so no real network call is made
vi.mock('../src/services/extractors/youtube/index.js', () => ({
  getInfo: vi.fn().mockResolvedValue({
    id: 'nTbA7qrEsP0',
    title: 'Awit Ng Bayan',
    author: 'Victory Worship',
    duration: 338,
    thumbnail: 'https://example.com/cover.jpg',
    extractor_key: 'youtube',
    is_js_info: true,
    formats: [
      { itag: 137, url: 'https://ex.com/137', resolution: '1080p', height: 1080, vcodec: 'avc1', quality: '1080p' }
    ],
    audioFormats: []
  }),
  getStream: vi.fn()
}));

import * as spotify from '../src/services/extractors/spotify.js';

describe('Spotify Extractor (Mocked)', () => {
  const url = 'https://open.spotify.com/track/1xwtOTVFN4MsGEKpGyKfIV';

  it('should parse metadata correctly using mocked data', async () => {
    const info = await spotify.getInfo(url) as VideoInfo;

    expect(info).toBeDefined();
    expect(info.title).toBe('Awit Ng Bayan (Mocked)');
    expect(info.artist).toBe('Victory Worship');
    expect(info.id).toBeDefined();
    expect(info.isrc).toBe('FR2X41721331'); // check mocked ISRC
    expect(info.previewUrl).toBe('https://p.scdn.co/mp3-preview/mocked');
  });
});
