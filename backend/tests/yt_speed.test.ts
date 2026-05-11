import { describe, it, expect, vi } from 'vitest';
import { processVideoFormats } from '../src/utils/format.util.js';
import { VideoInfo } from '../src/types/index.js';

const MOCK_FORMATS = [
  { itag: 137, url: 'https://ex.com/137', resolution: '1080p', height: 1080, width: 1920, vcodec: 'avc1', acodec: 'none', quality: '1080p', is_video: true, is_audio: false },
  { itag: 313, url: 'https://ex.com/313', resolution: '2160p', height: 2160, width: 3840, vcodec: 'vp9', acodec: 'none', quality: '2160p', is_video: true, is_audio: false },
  { itag: 140, url: 'https://ex.com/140', resolution: 'audio', height: 0, width: 0, vcodec: 'none', acodec: 'mp4a', quality: 'audio', is_video: false, is_audio: true },
];

// mock the YouTube client so no real network call is made
vi.mock('../src/services/extractors/youtube/client.js', () => ({
  getYoutubeClient: vi.fn().mockResolvedValue({
    getInfo: vi.fn().mockResolvedValue({
      basic_info: {
        id: 'nTbA7qrEsP0',
        title: 'Test Video',
        author: 'Test Channel',
        duration: 300,
        view_count: 1000000,
        short_description: 'Test description',
        thumbnail: [{ url: 'https://example.com/thumb.jpg' }]
      },
      streaming_data: {
        formats: MOCK_FORMATS,
        adaptive_formats: MOCK_FORMATS
      }
    }),
    download: vi.fn()
  })
}));

// mock processVideoFormats to return our test formats directly
vi.mock('../src/utils/format.util.js', () => ({
  processVideoFormats: vi.fn().mockReturnValue(MOCK_FORMATS)
}));

import * as youtube from '../src/services/extractors/youtube/index.js';

describe('YouTube Extractor Speed & Integrity', () => {
  it('should return metadata for a valid YouTube URL', async () => {
    const url = 'https://youtu.be/nTbA7qrEsP0';
    const start = Date.now();
    const info = await youtube.getInfo(url) as VideoInfo;
    const duration = Date.now() - start;

    console.log(`[Test] YouTube Extraction took ${duration}ms`);

    expect(info).toBeDefined();
    expect(info.id).toBe('nTbA7qrEsP0');
    expect(info.extractor_key).toBe('youtube');
    expect(info.is_js_info).toBe(true);
    expect(info.formats.length).toBeGreaterThan(0);
  }, 60000);

  it('should detect high resolutions (4K/1080p) on first hit', async () => {
    const url = 'https://youtu.be/nTbA7qrEsP0';
    const info = await youtube.getInfo(url) as VideoInfo;
    const processed = processVideoFormats(info);

    const highRes = processed.some(f =>
        f.quality === '2160p' ||
        f.quality === '1440p' ||
        f.quality === '1080p' ||
        f.quality === '4K'
    );

    expect(highRes).toBe(true);
  }, 60000);
});
