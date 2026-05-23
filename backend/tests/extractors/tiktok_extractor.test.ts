import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getInfo } from '../../src/services/extractors/tiktok.js';

describe('TikTok JS Extractor (Pure JS)', () => {
  const testUrl = 'https://vt.tiktok.com/ZS9PxUwTM/';
  const mockHtml = `
    <script>window.__UNIVERSAL_DATA_FOR_REHYDRATION__ = {
      "__DEFAULT_SCOPE__": {
        "webapp.video-detail": {
          "itemInfo": {
            "itemStruct": {
              "id": "123456",
              "desc": "Test Title #awesome",
              "author": { "nickname": "Test Author" },
              "video": {
                "cover": "https://thumb.jpg",
                "playAddr": "https://video.tiktok.com/v/test.mp4"
              }
            }
          }
        }
      }
    };</script>
    <script id="SIGI_STATE">
      {"ItemList":{"videoData":{"itemInfo":{"itemStruct":{
        "id": "123456",
        "video": {"playAddr": "https://video.tiktok.com/v/test.mp4", "cover": "https://thumb.jpg"},
        "desc": "Test Title #awesome",
        "author": "Test Author"
      }}}}}
    </script>
    <script>
      var data = { "video_id":"123456", "share_title":"Test Title", "author_name":"Test Author", "cover_data":{"url_list":["https://thumb.jpg"]}, "play_addr":{"url_list":["https://video.tiktok.com/v/test.mp4"]} };
    </script>
  `;

  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockHtml),
        url: 'https://www.tiktok.com/@test/video/123456',
      } as Response);
    });
  });

  it('should extract valid metadata including title and author', async () => {
    const info = await getInfo(testUrl);

    expect(info).not.toBeNull();
    if (info) {
      expect(info.title).toBeDefined();
      expect(info.title.length).toBeGreaterThan(5);
      expect(info.uploader).toBeDefined();
      expect(info.extractorKey).toBe('tiktok');
    }
  });

  it('should discover at least one video format URL', async () => {
    const info = await getInfo(testUrl);

    expect(info?.formats).toBeDefined();
    expect(info?.formats?.length).toBeGreaterThan(0);

    const firstFormat = info?.formats?.[0];
    expect(firstFormat?.url).toContain('http');
  });

  it('should correctly expand short URLs to full tiktok.com URLs', async () => {
    const info = await getInfo(testUrl);

    expect(info?.webpageUrl).toContain('tiktok.com/@');
    expect(info?.webpageUrl).toContain('/video/');
  });
});
