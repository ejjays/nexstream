import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import { streamDownload, YT_CLIENTS } from '../../src/services/ytdlp/streamer.js';
import { createMockChildProcess } from '../utils/mocks.js';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn() };
});

vi.mock('../../src/services/extractors/index.js', () => ({
  getExtractor: vi.fn(() => null),
  shouldJSStream: vi.fn(() => false),
}));

vi.mock('../../src/services/ytdlp/info.js', () => ({
  getVideoInfo: vi.fn(() =>
    Promise.resolve({
      id: 'testRotation',
      title: 'Client Rotation Test',
      formats: [
        {
          formatId: '140',
          url: 'https://rr1.googlevideo.com/test',
          vcodec: 'none',
          acodec: 'mp4a.40.2',
          ext: 'mp4',
        },
      ],
      targetUrl: 'https://www.youtube.com/watch?v=testRotation',
    })
  ),
}));

vi.mock('../../src/utils/network/proxy.util.js', () => ({
  getQuantumStream: vi.fn(() => {
    throw new Error('mock: direct fetch unavailable');
  }),
}));

const mockedSpawn = vi.mocked(spawn);

// only yt-dlp calls matter for client rotation; ffmpeg spawns are noise
function ytdlpCalls() {
  return mockedSpawn.mock.calls.filter((call) => call[0] === 'yt-dlp');
}

function clientFromCall(call: Parameters<typeof spawn>): string | undefined {
  const args = call[1] as string[];
  const arg = args.find((item) => item.includes('player-client='));
  return arg?.split('=')[1];
}

describe('YouTube Client Rotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses android_vr as first client', () => {
    const mock = createMockChildProcess({ exitCode: 0 });
    mockedSpawn.mockReturnValue(mock);

    streamDownload('https://www.youtube.com/watch?v=testRotation', {
      format: 'mp4',
    });

    // wait for async init
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const calls = ytdlpCalls();
        expect(calls.length).toBeGreaterThan(0);
        expect(clientFromCall(calls[0])).toBe(YT_CLIENTS[0]);
        resolve();
      }, 100);
    });
  });

  it('rotates to next client on failure', () => {
    // first yt-dlp spawn fails with 403
    const failMock = createMockChildProcess({
      exitCode: 1,
      stderr: 'ERROR: HTTP Error 403: Forbidden',
    });
    // second yt-dlp spawn (immediate rotation) succeeds
    const successMock = createMockChildProcess({ exitCode: 0 });

    mockedSpawn
      .mockReturnValueOnce(failMock)
      .mockReturnValueOnce(successMock)
      .mockReturnValue(createMockChildProcess({ exitCode: 0 }));

    streamDownload('https://www.youtube.com/watch?v=testRotation', {
      format: 'mp4',
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const calls = ytdlpCalls();
        expect(calls.length).toBeGreaterThanOrEqual(2);
        // streamer rotates immediately on retryable failure (no no-cache retry)
        expect(clientFromCall(calls[1])).toBe(YT_CLIENTS[1]);
        resolve();
      }, 500);
    });
  });

  it('includes all expected clients in rotation order', () => {
    // every spawn fails so we walk the full rotation
    mockedSpawn.mockImplementation(() =>
      createMockChildProcess({
        exitCode: 1,
        stderr: 'ERROR: 403 Forbidden',
      })
    );

    streamDownload('https://www.youtube.com/watch?v=testRotation', {
      format: 'mp4',
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const observed = ytdlpCalls()
          .map((call) => clientFromCall(call))
          .filter((c): c is string => Boolean(c));

        // should walk through YT_CLIENTS in declared order until exhausted
        expect(observed.length).toBeGreaterThan(1);
        for (let i = 0; i < observed.length; i++) {
          expect(observed[i]).toBe(YT_CLIENTS[i]);
        }
        resolve();
      }, 1500);
    });
  });
});
