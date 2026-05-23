import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamDownload } from '../../src/services/ytdlp/streamer';
import { spawn, type ChildProcess } from 'node:child_process';
import { PassThrough } from 'stream';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

vi.mock('../../src/services/extractors/index.js', () => ({
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
    vi.mocked(spawn).mockReturnValue(mockSpawn as unknown as ChildProcess);

    const mockInfo = {
      id: 'test',
      extractorKey: 'youtube',
      formats: [
        {
          formatId: '137',
          url: 'https://test.com/file.mp4',
          vcodec: 'avc1.640028',
          acodec: 'mp4a.40.2',
          ext: 'mp4',
        },
      ],
      targetUrl: 'http://test.com',
    };

    streamDownload(
      'http://test.com',
      { format: 'mp4', formatId: '137' },
      [],
      mockInfo
    );

    // wait IIFE
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(spawn).toHaveBeenCalledWith(
      'yt-dlp',
      expect.arrayContaining([expect.stringContaining('-bsf:a aac_adtstoasc')]),
      { detached: true }
    );

    const calls = vi.mocked(spawn).mock.calls;
    const ytdlpCall = calls.find((call) => call[0] === 'yt-dlp');
    expect(ytdlpCall).toBeDefined();

    if (ytdlpCall) {
      const args = ytdlpCall[1] as string[];
      const downloaderArgsIdx = args.indexOf('--downloader-args');
      expect(downloaderArgsIdx).toBeGreaterThan(-1);
      const downloaderArgs = args[downloaderArgsIdx + 1];
      expect(downloaderArgs).toContain(
        'ffmpeg:-c:v copy -c:a copy -bsf:a aac_adtstoasc -f mp4'
      );
    }
  });

  it('should include -bsf:a aac_adtstoasc filter when format is mp4 and shouldCopy is false', async () => {
    const mockSpawn = {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      on: vi.fn(),
      kill: vi.fn(),
    };
    vi.mocked(spawn).mockReturnValue(mockSpawn as unknown as ChildProcess);

    const mockInfo = {
      id: 'test',
      extractorKey: 'youtube',
      formats: [
        {
          formatId: '137',
          vcodec: 'vp09.00.50.08',
          acodec: 'opus',
        },
      ],
      targetUrl: 'http://test.com',
    };

    streamDownload(
      'http://test.com',
      { format: 'mp4', formatId: '137' },
      [],
      mockInfo
    );

    // wait IIFE
    await new Promise((resolve) => setTimeout(resolve, 500));

    const calls = vi.mocked(spawn).mock.calls;
    const ytdlpCall = calls.find((call) => call[0] === 'yt-dlp');
    expect(ytdlpCall).toBeDefined();

    if (ytdlpCall) {
      const args = ytdlpCall[1] as string[];
      const downloaderArgsIdx = args.indexOf('--downloader-args');
      expect(downloaderArgsIdx).toBeGreaterThan(-1);
      const downloaderArgs = args[downloaderArgsIdx + 1];
      expect(downloaderArgs).toContain(
        'ffmpeg:-c:v libx264 -preset ultrafast -threads 0 -crf 23 -c:a aac -b:a 128k -bsf:a aac_adtstoasc -f mp4 -movflags frag_keyframe+empty_moov+default_base_moof -frag_duration 1000000 -ignore_unknown'
      );
    }
  });
});
