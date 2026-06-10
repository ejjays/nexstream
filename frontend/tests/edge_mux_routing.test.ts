import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../src/lib/muxer', () => ({
  muxToMp4: vi.fn(),
  isClientMuxSupported: vi.fn(() => true),
}));
vi.mock('../src/lib/previewStream', () => ({
  resolveStreamUrls: vi.fn(),
  prefetchStreamUrls: vi.fn(),
}));

import {
  shouldUseEdgeMux,
  resolveEdgeMuxEligibility,
} from '../src/hooks/useDownloadOrchestrator';

const MB = 1024 * 1024;
const GB = 1024 * MB;

describe('shouldUseEdgeMux — large videos route to server', () => {
  it('uses edge mux for a small mp4', () => {
    expect(shouldUseEdgeMux('mp4', 12 * MB)).toBe(true);
  });

  it('skips edge mux for a large mp4 (>50MB)', () => {
    expect(shouldUseEdgeMux('mp4', 140 * MB)).toBe(false);
  });

  it('keeps edge mux for a small (short) clip regardless of resolution', () => {
    expect(shouldUseEdgeMux('mp4', 30 * MB)).toBe(true);
  });

  it('never uses edge mux for audio formats', () => {
    expect(shouldUseEdgeMux('mp3', 4 * MB)).toBe(false);
  });

  it('uses edge mux when size is unknown', () => {
    expect(shouldUseEdgeMux('mp4', 0)).toBe(true);
  });
});

function setStorage(storage?: unknown) {
  Object.defineProperty(globalThis.navigator, 'storage', {
    value: storage,
    configurable: true,
    writable: true,
  });
}

const opfs = (quota: number, usage = 0) => ({
  getDirectory: () => Promise.resolve({}),
  estimate: () => Promise.resolve({ quota, usage }),
});

describe('resolveEdgeMuxEligibility — storage-aware cap', () => {
  afterEach(() => setStorage());

  it('rejects non-mp4', async () => {
    expect(await resolveEdgeMuxEligibility('mp3', 10 * MB)).toBe(false);
  });

  it('allows unknown size', async () => {
    setStorage(opfs(10 * GB));
    expect(await resolveEdgeMuxEligibility('mp4', 0)).toBe(true);
  });

  it('rejects beyond the hard ceiling even with huge free space', async () => {
    setStorage(opfs(100 * GB));
    expect(await resolveEdgeMuxEligibility('mp4', 3 * GB)).toBe(false);
  });

  it('allows a 700MB 4K mux when OPFS has ample headroom', async () => {
    setStorage(opfs(10 * GB, 1 * GB));
    expect(await resolveEdgeMuxEligibility('mp4', 700 * MB)).toBe(true);
  });

  it('rejects a 700MB mux when OPFS headroom is tight', async () => {
    setStorage(opfs(1 * GB, 200 * MB));
    expect(await resolveEdgeMuxEligibility('mp4', 700 * MB)).toBe(false);
  });

  it('falls back to the RAM cap when OPFS is unavailable', async () => {
    setStorage();
    expect(await resolveEdgeMuxEligibility('mp4', 40 * MB)).toBe(true);
    expect(await resolveEdgeMuxEligibility('mp4', 700 * MB)).toBe(false);
  });

  it('falls back to the RAM cap when estimate throws', async () => {
    setStorage({
      getDirectory: () => Promise.resolve({}),
      estimate: () => Promise.reject(new Error('nope')),
    });
    expect(await resolveEdgeMuxEligibility('mp4', 40 * MB)).toBe(true);
    expect(await resolveEdgeMuxEligibility('mp4', 700 * MB)).toBe(false);
  });
});
