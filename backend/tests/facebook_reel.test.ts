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
          <meta property="og:description" content="Cool Reel Content #trending">
          <meta property="og:image" content="https://fb.com/thumb.jpg">
        </head>
        <body>
          <script>
            {"owner":{"__typename":"User","name":"Actual Creator"}}
            {"message":{"text":"Cool Reel Content #trending"}}
            {"video_id":"980670334391314","playable_url_quality_hd":"https://fb.com/video_hd.mp4"}
            {"video_id":"980670334391314","playable_url":"https://fb.com/video_sd.mp4"}
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
    expect(info.title).toBe('Cool Reel Content #trending');
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
            {"video_id":"123","base_url":"https://fb.com/video.mp4"}
            {"video_id":"123","base_url":"https://fb.com/fragment_1.mp4"}
            {"video_id":"123","base_url":"https://fb.com/audio_heaac.mp4"}
            {"video_id":"123","video_dash_manifest":"https://fb.com/manifest.mpd"}
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

  it('should isolate correct video in preloaded feed and extract split streams', async () => {
    const reelUrl = 'https://www.facebook.com/reel/TARGET_ID/';
    
    const mockHtml = `
      <html>
        <body>
          <script>
            // Unrelated preloaded video
            {"video_id":"WRONG_ID","browser_native_hd_url":"https://fb.com/wrong_video.mp4","audio_url":"https://fb.com/wrong_audio.mp4"}
          </script>
          <script>
            // Target video
            {"video_id":"TARGET_ID","browser_native_hd_url":"https://fb.com/target_video.mp4","audio_url":"https://fb.com/target_audio.mp4"}
          </script>
        </body>
      </html>
    `;

    global.fetch = vi.fn().mockImplementation((url: string) => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockHtml),
        headers: { 
            get: (name: string) => {
                if (name === 'content-length') return '1000000';
                return null;
            }
        },
        url: reelUrl
    } as unknown as Response));

    const info = await facebookExtractor.getInfo(reelUrl) as any;
    
    expect(info).not.toBeNull();
    expect(info.formats.some((f: any) => f.url.includes('wrong_video'))).toBe(false);
    
    const hdMuxed = info.formats.find((f: any) => f.format_id === 'hd_muxed');
    expect(hdMuxed).toBeDefined();
    expect(hdMuxed.url).toBe('https://fb.com/target_video.mp4');
    expect(hdMuxed.audio_url).toBe('https://fb.com/target_audio.mp4');
  });

  it('should correctly categorize split DASH components', async () => {
    const reelUrl = 'https://www.facebook.com/reel/123/';
    const mockHtml = `
      <html>
        <body>
          <script>
            {"video_id":"123","base_url":"https://fb.com/video_only.mp4?bytestart=0"}
            {"video_id":"123","audio_url":"https://fb.com/audio_only.m4a"}
            {"video_id":"123","base_url":"https://fb.com/video_muxed.mp4?nc_cat=1"}
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
    
    const videoOnly = info.formats.find(f => f.url.includes('video_only'));
    const audioOnly = info.formats.find(f => f.url.includes('audio_only'));
    const muxed = info.formats.find(f => f.url.includes('video_muxed'));

    expect(videoOnly?.is_video).toBe(true);
    expect(videoOnly?.is_audio).toBe(false);

    expect(audioOnly?.is_video).toBe(false);
    expect(audioOnly?.is_audio).toBe(true);

    expect(muxed?.is_muxed).toBe(true);
  });

  it('should ignore unrelated formats in the same script block', async () => {
    const reelUrl = 'https://www.facebook.com/reel/TARGET_ID/';
    const mockHtml = `
      <html>
        <body>
          <script>
            [
              {"video_id":"WRONG_ID","base_url":"https://fb.com/wrong_video.mp4","bandwidth":500000},
              {"video_id":"TARGET_ID","base_url":"https://fb.com/target_video.mp4","bandwidth":900000}
            ]
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
    
    expect(info.formats.length).toBe(1);
    expect(info.formats[0].url).toBe('https://fb.com/target_video.mp4');
  });
});
