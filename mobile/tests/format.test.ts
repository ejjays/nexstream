import { describe, it, expect } from 'vitest';
import { formatSize, formatLabel, dlLabel } from '../src/lib/format';
import type { Format } from '../src/extractors/types';

const makeFormat = (over: Partial<Format>): Format => ({
  formatId: 'f1',
  url: 'https://example.com/v.mp4',
  extension: 'mp4',
  isAudio: false,
  isVideo: true,
  isMuxed: true,
  ...over,
});

describe('formatSize', () => {
  it('returns empty string for missing or zero size', () => {
    expect(formatSize(undefined)).toBe('');
    expect(formatSize(0)).toBe('');
  });

  it('formats megabytes at or above 1MB', () => {
    expect(formatSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formats kilobytes below 1MB', () => {
    expect(formatSize(512 * 1024)).toBe('512 KB');
  });
});

describe('formatLabel', () => {
  it('prefers quality, then resolution, then formatId', () => {
    expect(
      formatLabel(makeFormat({ quality: '1080p', resolution: '1920x1080' }))
    ).toBe('1080p');
    expect(formatLabel(makeFormat({ resolution: '1920x1080' }))).toBe(
      '1920x1080'
    );
    expect(formatLabel(makeFormat({ formatId: '137' }))).toBe('137');
  });
});

describe('dlLabel', () => {
  it('maps download state to a label', () => {
    expect(dlLabel({ status: 'downloading', progress: 42 })).toBe('42%');
    expect(dlLabel({ status: 'saved', progress: 100 })).toBe('Done ✓');
    expect(dlLabel({ status: 'error', progress: 0 })).toBe('Retry');
    expect(dlLabel(undefined)).toBe('Download');
  });
});
