import { describe, it, expect } from 'vitest';
import { getInfo } from '../../src/services/extractors/youtube/index.js';
import { VideoInfo } from '../../src/types/index.js';

describe('YouTube Extractor Speed & Integrity', () => {
  it('should return metadata for a valid YouTube URL', async () => {
    const url = 'https://youtu.be/nTbA7qrEsP0';
    const start = Date.now();
    const info = (await getInfo(url)) as VideoInfo;
    const duration = Date.now() - start;

    console.log(`[Test] YouTube Extraction took ${duration}ms`);

    expect(info).toBeDefined();
    expect(info.id).toBe('nTbA7qrEsP0');
    expect(info.extractorKey).toBe('youtube');
    expect(info.isJsInfo).toBe(true);
    expect(info.formats.length).toBeGreaterThan(0);
  }, 60000);

  it('should detect high resolutions (4K/1080p) on first hit', async () => {
    const url = 'https://youtu.be/nTbA7qrEsP0';
    const info = (await getInfo(url)) as VideoInfo;
    const processed = info.formats;
    console.log(
      '[Test] Discovered qualities:',
      processed.map((f) => f.quality)
    );

    const highRes = processed.some(
      (f) =>
        f.quality === '2160p' ||
        f.quality === '1440p' ||
        f.quality === '1080p' ||
        f.quality === '720p' ||
        f.quality === '4K'
    );

    expect(highRes).toBe(true);
  }, 60000);
});
