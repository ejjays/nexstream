import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamDownload } from '../src/services/ytdlp/streamer';
import * as child_process from 'node:child_process';
import { PassThrough } from 'stream';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

vi.mock('../src/services/extractors/index.js', () => ({
  getExtractor: vi.fn(() => null),
  shouldJSStream: vi.fn(() => false),
}));

describe('streamDownload FFmpeg arguments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should include -bsf:a aac_adtstoasc filter when format is mp4 and shouldCopy is true', async () => {
    const mockSpawn = {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      on: vi.fn(),
      kill: vi.fn(),
    };
    vi.mocked(child_process.spawn).mockReturnValue(mockSpawn as any);

    const mockInfo = {
      id: 'test',
      extractor_key: 'youtube',
      formats: [
        {
          format_id: '137',
          vcodec: 'avc1.640028',
          acodec: 'mp4a.40.2',
        }
      ],
      target_url: 'http://test.com',
    };

    streamDownload('http://test.com', { format: 'mp4', formatId: '137' }, [], mockInfo);
    
    // wait IIFE
    await new Promise(resolve => setTimeout(resolve, 500));

    expect(child_process.spawn).toHaveBeenCalledWith('yt-dlp', expect.arrayContaining([
      expect.stringContaining('-bsf:a aac_adtstoasc')
    ]));
    
    const calls = vi.mocked(child_process.spawn).mock.calls;
    const ytdlpCall = calls.find(call => call[0] === 'yt-dlp');
    expect(ytdlpCall).toBeDefined();
    
    if (ytdlpCall) {
        const args = ytdlpCall[1] as string[];
        const downloaderArgsIdx = args.indexOf('--downloader-args');
        expect(downloaderArgsIdx).toBeGreaterThan(-1);
        const downloaderArgs = args[downloaderArgsIdx + 1];
        expect(downloaderArgs).toContain('ffmpeg:-c:v copy -c:a copy -bsf:a aac_adtstoasc -f mp4');
    }
  });

  it('should include -bsf:a aac_adtstoasc filter when format is mp4 and shouldCopy is false', async () => {
    const mockSpawn = {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      on: vi.fn(),
      kill: vi.fn(),
    };
    vi.mocked(child_process.spawn).mockReturnValue(mockSpawn as any);

    const mockInfo = {
      id: 'test',
      extractor_key: 'youtube',
      formats: [
        {
          format_id: '137',
          vcodec: 'vp09.00.50.08',
          acodec: 'opus',
        }
      ],
      target_url: 'http://test.com',
    };

    streamDownload('http://test.com', { format: 'mp4', formatId: '137' }, [], mockInfo);
    
    // wait IIFE
    await new Promise(resolve => setTimeout(resolve, 500));

    const calls = vi.mocked(child_process.spawn).mock.calls;
    const ytdlpCall = calls.find(call => call[0] === 'yt-dlp');
    expect(ytdlpCall).toBeDefined();
    
    if (ytdlpCall) {
        const args = ytdlpCall[1] as string[];
        const downloaderArgsIdx = args.indexOf('--downloader-args');
        expect(downloaderArgsIdx).toBeGreaterThan(-1);
        const downloaderArgs = args[downloaderArgsIdx + 1];
        expect(downloaderArgs).toContain('ffmpeg:-c:v libx264 -preset ultrafast -tune zerolatency -threads 0 -crf 23 -c:a aac -bsf:a aac_adtstoasc -f mp4');
    }
  });
});
