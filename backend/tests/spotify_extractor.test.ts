import { describe, it, expect } from 'vitest';
import * as spotify from '../src/services/extractors/spotify.js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { VideoInfo } from '../src/types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

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
