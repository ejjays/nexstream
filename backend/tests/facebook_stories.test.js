import { describe, it, expect, vi, beforeEach } from 'vitest';
const facebookExtractor = require('../src/services/extractors/facebook');

describe('Facebook Stories Extractor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect story URLs and extract video metadata from JSON', async () => {
    const storyUrl = 'https://www.facebook.com/stories/12345/67890/';
    
    // mock html
    const mockHtml = `
      <html>
        <body>
          <script>
            var x = {
              "unified_video_url":"https:\\/\\/video.fb.com\\/v\\/story_hd.mp4?_nc_cat=101",
              "playable_url":"https:\\/\\/video.fb.com\\/v\\/story_sd.mp4?_nc_cat=102",
              "story_bucket_owner_name":"Test User",
              "preferred_thumbnail":{"image":{"uri":"https:\\/\\/scontent.fb.com\\/thumb.jpg"}}
            };
          </script>
        </body>
      </html>
    `;

    global.fetch = vi.fn().mockImplementation((url) => {
        return Promise.resolve({
            ok: true,
            status: 200,
            url: storyUrl,
            text: () => Promise.resolve(mockHtml),
            headers: { get: () => null }
        });
    });

    const info = await facebookExtractor.getInfo(storyUrl);

    expect(info).not.toBeNull();
    expect(info.author).toBe('Test User');
    expect(info.formats.length).toBeGreaterThanOrEqual(1);
    
    const hdFormat = info.formats.find(f => f.format_id === 'hd');
    expect(hdFormat).toBeDefined();
    expect(hdFormat.url).toContain('story_hd.mp4');

    expect(info.thumbnail).toBe('https://scontent.fb.com/thumb.jpg');
  });

  it('should fallback gracefully when metadata is missing', async () => {
    const storyUrl = 'https://www.facebook.com/stories/123/';
    const mockHtml = `<html><body><script>var x = {"playable_url":"https:\\/\\/fb.com\\/v.mp4"};</script></body></html>`;
    
    global.fetch = vi.fn().mockImplementation((url) => {
        return Promise.resolve({
            ok: true,
            status: 200,
            url: storyUrl,
            text: () => Promise.resolve(mockHtml),
            headers: { get: () => null }
        });
    });

    const info = await facebookExtractor.getInfo(storyUrl);
    expect(info).not.toBeNull();
    expect(info.author).toBe('Facebook User');
    expect(info.formats[0].url).toBe('https://fb.com/v.mp4');
  });
});
