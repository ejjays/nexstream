import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getInfo,
  getStream,
} from '../../src/services/extractors/facebook/index.js';
import { Readable } from 'node:stream';

describe('Facebook JS Extractor (Pure JS)', () => {
  const testUrl = 'https://www.facebook.com/share/r/1KJUSQ3JkR/';

  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('facebook.com')) {
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(`
            <html>
              <body>
                <script>
                  {"owner":{"name":"Test User"}}
                  {"message":{"text":"Test Title"}}
                  {"video_id":"123456","browser_native_hd_url":"https://fb.com/video.mp4","audioUrl":"https://fb.com/audio.mp4"}
                </script>
              </body>
            </html>
          `),
          headers: { get: () => 'text/html' },
          url: testUrl,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        headers: { get: () => '1000000' },
      } as Response);
    });
  });

  it('should extract metadata and formats', async () => {
    const info = await getInfo(testUrl);
    expect(info).not.toBeNull();
    expect(info?.formats?.length).toBeGreaterThan(0);
    expect(info?.title).toBe('Test Title');
  });

  it('should be able to initiate a stream (Pure JS Stream)', async () => {
    const info = await getInfo(testUrl);
    if (!info) throw new Error('Info extraction failed');

    const formatId = info.formats[0].formatId;
    const stream = await getStream(info, { formatId });

    expect(stream).toBeInstanceOf(Readable);
    stream.destroy();
  });
});
