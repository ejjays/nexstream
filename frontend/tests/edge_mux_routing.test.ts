import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/muxer', () => ({
  muxToMp4: vi.fn(),
  isClientMuxSupported: vi.fn(() => true),
}));
vi.mock('../src/lib/previewStream', () => ({
  resolveStreamUrls: vi.fn(),
  prefetchStreamUrls: vi.fn(),
}));

import { shouldUseEdgeMux } from '../src/hooks/useDownloadOrchestrator';

const MB = 1024 * 1024;

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
