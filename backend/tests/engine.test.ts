import { describe, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// mock redis
vi.mock('ioredis', () => {
  const mockClass = class {
    get = vi.fn().mockResolvedValue(null);
    set = vi.fn().mockResolvedValue('OK');
    del = vi.fn().mockResolvedValue(1);
    quit = vi.fn().mockResolvedValue('OK');
    on = vi.fn();
    status = 'ready';
    subscribe = vi.fn().mockImplementation((_channel, cb) => cb?.(null));
    publish = vi.fn().mockResolvedValue(1);
  };
  return { default: mockClass, Redis: mockClass };
});

// mock spawn
vi.mock('node:child_process', () => ({
  spawn: vi.fn()
}));

// mock spotify
vi.mock('../src/services/spotify/metadata.js', () => ({
  fetchInitialMetadata: vi.fn().mockImplementation((url) => {
    return Promise.resolve({
      metadata: {
        title: url.includes('2zo9LbUgr') ? 'Pag-ibig Na Kay Ganda' : 'Big Buck Bunny',
        artist: 'Spring Worship',
        isrc: 'PHB362300001',
        imageUrl: 'https://example.com/cover.jpg',
        duration: 338000
      }
    });
  }),
  resolveSideTasks: vi.fn().mockResolvedValue({}),
  fetchPreviewUrlManually: vi.fn().mockResolvedValue('https://example.com/preview.mp3')
}));

// mock extractors
vi.mock('../src/services/extractors/index.js', () => {
  return {
    getInfo: vi.fn().mockImplementation((url: string) => {
       const isSpotify = url.includes('spotify.com') || url.includes('2zo9LbUgr');
       return Promise.resolve({
         id: isSpotify ? 'sp_123' : 'yt_123',
         title: isSpotify ? 'Pag-ibig Na Kay Ganda' : 'Big Buck Bunny',
         uploader: isSpotify ? 'Spring Worship' : 'Blender',
         formats: [
           { 
             format_id: isSpotify ? 'audio_1' : 'video_1', 
             ext: isSpotify ? 'm4a' : 'mp4', 
             vcodec: isSpotify ? 'none' : 'h264', 
             acodec: isSpotify ? 'aac' : 'yes' 
           }
         ],
         webpage_url: url,
         isrc: isSpotify ? 'PHB362300001' : undefined
       });
    }),
    getExtractor: vi.fn(),
    shouldJSStream: vi.fn().mockReturnValue(true)
  };
});

// deps
import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { getVideoInfo } from '../src/services/ytdlp.service.js';
import rawCases from './fixtures/sites.json';
import { CaseSchema } from './utils/schema.js';
import { assertOutcome } from './utils/assert.js';

// load cases
const testCases = z.array(CaseSchema).parse(rawCases);

describe('engine', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(testCases)('verify $name', async ({ url, expected }) => {
    const startTime = performance.now();
    
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const mockProcess = Object.assign(new EventEmitter(), {
      stdout,
      stderr,
      stdin: new EventEmitter(),
      stdio: [new EventEmitter(), stdout, stderr]
    }) as unknown as ChildProcess;
    
    const mockMetadata = {
      title: expected.title || 'test',
      uploader: 'Spring Worship',
      duration: 120,
      isrc: expected.mustHaveIsrc ? 'PHB362300001' : undefined,
      formats: [
        { 
          format_id: '137', 
          ext: expected.type === 'audio' ? 'm4a' : 'mp4', 
          vcodec: expected.type === 'video' ? 'h264' : 'none',
          acodec: expected.type === 'audio' ? 'aac' : 'none'
        }
      ],
      thumbnail: 'https://example.com/thumb.jpg'
    };

    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockProcess);

    setTimeout(() => {
      (mockProcess.stdout as unknown as EventEmitter).emit('data', JSON.stringify(mockMetadata));
      (mockProcess as unknown as EventEmitter).emit('close', 0);
    }, 50);

    // wait for resolve
    let info = await getVideoInfo(url, [], false, null, 'test');
    if (info.isPartial) {
        await new Promise(r => setTimeout(r, 100));
        info = await getVideoInfo(url, [], false, null, 'test');
    }

    const duration = performance.now() - startTime;

    // check result
    assertOutcome(info, expected);
    
    console.log(`[engine] ${expected.title} ok (${duration.toFixed(2)}ms)`);
  });
});
