import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as facebookExtractor from '../src/services/extractors/facebook.js';
import { VideoInfo, ExtractorOptions } from '../src/types/index.js';

describe('Facebook Reel JS Extractor (Integration-style)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should extract metadata and streams for a live Reel URL', async () => {
    // hits network
    const reelUrl = 'https://www.facebook.com/share/r/1P9rv4BUT7/';
    
    const options: ExtractorOptions = { cookie_name: 'Cristel Jm Verga' };
    const info = await facebookExtractor.getInfo(reelUrl, options) as VideoInfo;
    
    expect(info).not.toBeNull();
    expect(info.id).toBeDefined();
    
    // validate content
    expect(info.title).toBeDefined();
    expect(info.title.length).toBeGreaterThan(5);
    
    expect(info.author).toBeDefined();
    expect(info.author.length).toBeGreaterThan(3);
    
    expect(info.thumbnail).toBeDefined();
    expect(info.thumbnail).toContain('http');
    
    expect(info.formats.length).toBeGreaterThan(0);
    
    // check audio/video
    const hasAudio = info.formats.some(f => f.is_audio);
    const hasVideo = info.formats.some(f => f.is_video);
    expect(hasAudio).toBe(true);
    expect(hasVideo).toBe(true);
  });
});
