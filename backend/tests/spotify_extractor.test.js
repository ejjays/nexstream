import { describe, it, expect, vi } from 'vitest';
const spotify = require('../src/services/extractors/spotify');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

describe('Spotify Extractor (Mocked)', () => {
  const url = 'https://open.spotify.com/track/1xwtOTVFN4MsGEKpGyKfIV';

  it('should parse metadata correctly using mocked data', async () => {
    const info = await spotify.getInfo(url);
    
    expect(info).toBeDefined();
    expect(info.title).toBe('Awit Ng Bayan (Mocked)');
    expect(info.artist).toBe('Victory Worship');
    expect(info.id).toBe('FR2X41721331'); // check ISRC
    expect(info.previewUrl).toBe('https://example.com/preview.mp3');
  });
});
