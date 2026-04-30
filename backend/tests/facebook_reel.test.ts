import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as facebookExtractor from '../src/services/extractors/facebook.js';
import { VideoInfo, ExtractorOptions } from '../src/types/index.js';

describe('Facebook Reel JS Extractor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should extract metadata from a Reel URL with mocked HTML', async () => {
    const reelUrl = 'https://www.facebook.com/reel/980670334391314/';
    
    const mockHtml = `
      <html>
        <head>
          <meta property="og:title" content="Facebook">
          <meta property="og:description" content="Actual content description #trending">
          <meta property="og:image" content="https://fb.com/thumb.jpg">
        </head>
        <body>
          <script>
            {"owner":{"__typename":"User","name":"Actual Creator"}}
            {"message":{"text":"Cool Reel Content"}}
            {"playable_url_quality_hd":"https://fb.com/video_hd.mp4"}
            {"playable_url":"https://fb.com/video_sd.mp4"}
          </script>
        </body>
      </html>
    `;

    global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('facebook.com')) {
            return Promise.resolve({
                ok: true,
                text: () => Promise.resolve(mockHtml),
                headers: { get: () => 'text/html' },
                url: reelUrl
            } as Response);
        }
        return Promise.resolve({
            ok: true,
            headers: { 
                get: (name: string) => {
                    if (name === 'content-length') return '1000000';
                    return null;
                }
            }
        } as Response);
    });

    const options: ExtractorOptions = { cookie: 'mock' };
    const info = await facebookExtractor.getInfo(reelUrl, options) as VideoInfo;
    
    expect(info).not.toBeNull();
    expect(info.title).toBe('Cool Reel Content');
    expect(info.author).toBe('Actual Creator');
    expect(info.thumbnail).toContain('thumb.jpg');
    expect(info.formats.length).toBeGreaterThan(0);
    expect(info.formats.some(f => f.resolution?.includes('HD'))).toBe(true);
  });

  it('should filter out DASH segments and audio-only streams', async () => {
    const reelUrl = 'https://www.facebook.com/reel/123/';
    const mockHtml = `
      <html>
        <body>
          <script>
            {"base_url":"https://fb.com/video.mp4"}
            {"base_url":"https://fb.com/fragment_1.mp4"}
            {"base_url":"https://fb.com/audio_heaac.mp4"}
            {"video_dash_manifest":"https://fb.com/manifest.mpd"}
          </script>
        </body>
      </html>
    `;

    global.fetch = vi.fn().mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockHtml),
        headers: { 
            get: (name: string) => {
                if (name === 'content-length') return '1000000';
                return null;
            }
        },
        url: reelUrl
    } as Response));

    const info = await facebookExtractor.getInfo(reelUrl) as VideoInfo;
    
    expect(info.formats.length).toBeGreaterThanOrEqual(1);
    expect(info.formats.some(f => f.url === 'https://fb.com/video.mp4')).toBe(true);
  });
});
