import { describe, it, expect, vi, beforeEach } from 'vitest';
const facebookExtractor = require('../src/services/extractors/facebook');

describe('Facebook Reel JS Extractor (Integration-style)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should extract metadata and streams for a live Reel URL', async () => {
    // This test hits the network for metadata verification
    const reelUrl = 'https://www.facebook.com/share/r/1P9rv4BUT7/';
    
    const info = await facebookExtractor.getInfo(reelUrl, { cookie_name: 'Critel Jm Verga' });
    
    expect(info).not.toBeNull();
    expect(info.id).toBeDefined();
    
    // Check for non-placeholder content if possible, but at least ensure it's not empty
    expect(info.title).toBeDefined();
    expect(info.title.length).toBeGreaterThan(5);
    
    expect(info.author).toBeDefined();
    expect(info.author.length).toBeGreaterThan(3);
    
    expect(info.thumbnail).toBeDefined();
    expect(info.thumbnail).toContain('http');
    
    expect(info.formats.length).toBeGreaterThan(0);
    
    // Ensure we have audio components (either muxed or separate audio streams)
    const hasAudio = info.formats.some(f => f.is_audio);
    const hasVideo = info.formats.some(f => f.is_video);
    expect(hasAudio).toBe(true);
    expect(hasVideo).toBe(true);
  });

  it('should correctly categorize split DASH components', async () => {
    const reelUrl = 'https://www.facebook.com/reel/123/';
    const mockHtml = `
      <html>
        <body>
          <script>
            {"base_url":"https://fb.com/video_only.mp4?bytestart=0"}
            {"audio_url":"https://fb.com/audio_only.m4a"}
            {"base_url":"https://fb.com/video_muxed.mp4?nc_cat=1"}
          </script>
        </body>
      </html>
    `;

    global.fetch = vi.fn().mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockHtml),
        headers: { get: () => '1000000' },
        url: reelUrl
    }));

    const info = await facebookExtractor.getInfo(reelUrl);
    
    const videoOnly = info.formats.find(f => f.url.includes('video_only'));
    const audioOnly = info.formats.find(f => f.url.includes('audio_only'));
    const muxed = info.formats.find(f => f.url.includes('video_muxed'));

    expect(videoOnly.is_video).toBe(true);
    expect(videoOnly.is_audio).toBe(false);

    expect(audioOnly.is_video).toBe(false);
    expect(audioOnly.is_audio).toBe(true);

    expect(muxed.is_muxed).toBe(true);
  });
});
