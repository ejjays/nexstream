import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamDownload } from '../../src/services/ytdlp/streamer';
import { COMMON_ARGS } from '../../src/services/ytdlp/config';
import { spawn } from 'node:child_process';
import { createMockChildProcess } from '../utils/mocks.js';

// throttle bypass regression guard

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

describe('yt-dlp throttle-bypass arguments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses android_vr as default client (rotates on failure)', async () => {
    const mockSpawn = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockSpawn);

    streamDownload(
      'http://test.com',
      { format: 'mp4', formatId: '137' },
      [],
      {
        id: 'throttleArgsTest',
        extractorKey: 'youtube',
        formats: [
          {
            formatId: '137',
            vcodec: 'avc1.640028',
            acodec: 'mp4a.40.2',
            ext: 'mp4',
          },
        ],
        targetUrl: 'http://test.com',
      } as unknown as Parameters<typeof streamDownload>[3]
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    const ytdlpCall = vi
      .mocked(spawn)
      .mock.calls.find((call) => call[0] === 'yt-dlp');
    expect(ytdlpCall).toBeDefined();

    const args = ytdlpCall?.[1] as string[];
    const idx = args.indexOf('--extractor-args');
    expect(idx).toBeGreaterThan(-1);
    const extractorArg = args[idx + 1];
    expect(extractorArg).toBe('youtube:player-client=android_vr');
  });

  it('uses 10M http-chunk-size and 1M buffer-size for fewer round-trips', () => {
    const chunkIdx = COMMON_ARGS.indexOf('--http-chunk-size');
    expect(chunkIdx).toBeGreaterThan(-1);
    expect(COMMON_ARGS[chunkIdx + 1]).toBe('10M');

    const bufIdx = COMMON_ARGS.indexOf('--buffer-size');
    expect(bufIdx).toBeGreaterThan(-1);
    expect(COMMON_ARGS[bufIdx + 1]).toBe('1M');
  });
});
