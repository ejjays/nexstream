import { describe, it, expect, vi } from 'vitest';
import * as sse from '../src/utils/sse.util.js';
import * as extractors from '../src/services/extractors/index.js';
import * as validation from '../src/utils/validation.util.js';
import { getVideoInfo } from '../src/services/ytdlp/info.js';
import { VideoInfo } from '../src/types/index.js';

describe('SSE Realtime Regression', () => {
  it('should capture expected SSE events during extraction', async () => {
    const capturedEvents: Array<{ id: string; subStatus: string; [key: string]: unknown }> = [];
    
    // mock send event
    vi.spyOn(sse, 'sendEvent').mockImplementation((id: string, data: { subStatus: string; [key: string]: unknown }) => {
        capturedEvents.push({ id, ...data });
    });

    // mock extract info
    vi.spyOn(extractors, 'getInfo').mockImplementation(async (_url: string, options?: { onProgress?: (status: string, progress: number, subStatus: string, detail: string) => void }) => {
        if (options && options.onProgress) {
            options.onProgress('fetching_info', 15, 'Scanning Test...', 'TEST_DETAILS');
        }
        return { 
            id: 'test', 
            formats: [{ format_id: '1', url: 'https://ex.com', ext: 'mp4' }], 
            title: 'Test',
            uploader: 'Test User',
            thumbnail: 'https://ex.com/thumb.jpg',
            webpage_url: 'https://ex.com/watch'
        } as VideoInfo;
    });

    // mock validation
    vi.spyOn(validation, 'isSupportedUrl').mockReturnValue(true);

    const url = 'https://vt.tiktok.com/ZS123456/'; 
    
    await getVideoInfo(url, [], false, null, 'reg-123');
    
    // await async
    await new Promise(r => setTimeout(r, 100));
    
    console.log('Captured statuses:', capturedEvents.map(e => e.subStatus));
    
    expect(capturedEvents.map(e => e.subStatus)).toEqual([
      'Expanding short-links...',
      'Scanning Test...'
    ]);
  });
});
