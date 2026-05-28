import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { streamDownload } from '../../src/services/ytdlp/streamer.js';
import { createMockChildProcess } from '../utils/mocks.js';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn() };
});

vi.mock('../../src/services/extractors/index.js', () => ({
  getExtractor: vi.fn(() => null),
  shouldJSStream: vi.fn(() => false),
}));

vi.mock('../../src/utils/network/proxy.util.js', () => ({
  getQuantumStream: vi.fn(() => {
    const stream = new PassThrough();
    process.nextTick(() => stream.emit('error', new Error('mock fail')));
    return stream;
  }),
}));

const mockedSpawn = vi.mocked(spawn);

function getClientFromCall(callIndex: number): string | undefined {
  const args = mockedSpawn.mock.calls[callIndex]?.[1] as string[] | undefined;
  if (!args) return undefined;
  const arg = args.find((item) => item.includes('player-client='));
  return arg?.split('=')[1];
}

async function runWithFormat(formatId: string, height: number, vcodec = 'avc1') {
  const proc = createMockChildProcess();
  mockedSpawn.mockReturnValue(proc);

  streamDownload(
    'https://www.youtube.com/watch?v=smartTest',
    { format: 'mp4', formatId },
    [],
    {
      id: 'smartTest',
      extractorKey: 'youtube',
      formats: [{ formatId, vcodec, acodec: 'none', ext: 'mp4', height }],
      targetUrl: 'https://www.youtube.com/watch?v=smartTest',
    } as unknown as Parameters<typeof streamDownload>[3]
  );

  await new Promise((resolve) => setTimeout(resolve, 200));
}

describe('Smart client selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses android_vr for 1080p formats (fast path)', async () => {
    await runWithFormat('137', 1080);
    expect(getClientFromCall(0)).toBe('android_vr');
  });

  it('uses android_vr for 720p formats', async () => {
    await runWithFormat('22', 720);
    expect(getClientFromCall(0)).toBe('android_vr');
  });

  it('uses mweb for 4K AV1 (format 401)', async () => {
    await runWithFormat('401', 2160, 'av01');
    expect(getClientFromCall(0)).toBe('mweb');
  });

  it('uses mweb for 8K formats by height', async () => {
    await runWithFormat('571', 4320, 'av01');
    expect(getClientFromCall(0)).toBe('mweb');
  });

  it('uses mweb for VP9 4K (format 313)', async () => {
    await runWithFormat('313', 2160, 'vp9');
    expect(getClientFromCall(0)).toBe('mweb');
  });
});
