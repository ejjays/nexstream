import { describe, it, expect, vi } from 'vitest';
import * as infoService from '../src/services/ytdlp/info.js';
import { VideoInfo } from '../src/types/index.js';

// mock the JS extractor index (used via dynamic import in ytdlp/info.ts)
vi.mock('../src/services/extractors/index.js', () => ({
  getInfo: vi.fn().mockResolvedValue({
    id: 'nTbA7qrEsP0',
    title: 'Test Video',
    duration: 300,
    extractor_key: 'youtube',
    is_js_info: true,
    formats: [
      { itag: 18, url: 'https://ex.com/18', resolution: '360p', height: 360, vcodec: 'avc1', quality: '360p' },
      { itag: 137, url: 'https://ex.com/137', resolution: '1080p', height: 1080, vcodec: 'avc1', quality: '1080p' }
    ]
  }),
  getExtractor: vi.fn(),
  extractId: vi.fn().mockReturnValue('nTbA7qrEsP0')
}));

describe('Resolution Persistence Test', () => {
  it('should return processed HD formats through the fast-path', async () => {
    // call getVideoInfo
    const info = await infoService.getVideoInfo('https://www.youtube.com/watch?v=nTbA7qrEsP0') as VideoInfo;

    expect(info.formats).toBeDefined();
    expect(info.formats.length).toBeGreaterThan(0);

    // the first format should be HD (either 1080p from JS or higher from prefetch)
    const topQuality = info.formats[0].quality;
    if (topQuality) {
        const height = parseInt(topQuality);
        expect(height).toBeGreaterThanOrEqual(1080);
    }
  });
});
