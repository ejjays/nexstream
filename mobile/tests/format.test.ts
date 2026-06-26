import { describe, it, expect } from 'vitest';
import {
  formatSize,
  formatLabel,
  dlLabel,
  prettyName,
  refererFor,
  previewableFormat,
} from '../src/lib/format';
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
    expect(formatSize()).toBe('');
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
    expect(dlLabel()).toBe('Download');
  });
});

describe('prettyName', () => {
  it('strips characters illegal in filenames', () => {
    expect(prettyName('a<b>c:d"e/f\\g|h?i*j')).toBe('abcdefghij');
  });

  it('strips brackets and uri-unsafe punctuation', () => {
    expect(prettyName('Episode 1 [Tagalog Dubbed]')).toBe(
      'Episode 1 Tagalog Dubbed'
    );
    expect(prettyName('mix {a} #1 100% ^v `x`')).toBe('mix a 1 100 v x');
  });

  it('collapses whitespace, newlines and tabs into single spaces', () => {
    expect(prettyName('hello   \n\t world')).toBe('hello world');
  });

  it('falls back to "video" when nothing survives cleaning', () => {
    expect(prettyName('   ')).toBe('video');
    expect(prettyName('/\\:*?')).toBe('video');
  });

  it('truncates long titles to 64 chars plus ellipsis', () => {
    const out = prettyName('x'.repeat(100));
    expect(out).toBe(`${'x'.repeat(64)}...`);
    expect(out).toHaveLength(67);
  });

  it('passes a clean title through unchanged', () => {
    expect(prettyName('My Cool Video')).toBe('My Cool Video');
  });
});

describe('refererFor', () => {
  it.each<[string, string]>([
    ['tiktok', 'https://www.tiktok.com/'],
    ['x', 'https://x.com/'],
    ['threads', 'https://www.threads.com/'],
    ['bluesky', 'https://bsky.app/'],
    ['reddit', 'https://www.reddit.com/'],
    ['facebook', 'https://www.facebook.com/'],
    ['youtube', 'https://www.facebook.com/'],
  ])('maps %s to its referer', (key, expected) => {
    expect(refererFor(key)).toBe(expected);
  });
});

describe('previewableFormat', () => {
  const muxed = makeFormat({ formatId: 'm', isMuxed: true });
  const videoOnly = makeFormat({
    formatId: 'v',
    isMuxed: false,
    muxAudioUrl: 'https://example.com/a.m4a',
  });
  const audioOnly = makeFormat({
    formatId: 'a',
    isAudio: true,
    isVideo: false,
    isMuxed: false,
  });

  it('returns a muxed video stream directly', () => {
    expect(previewableFormat([muxed], muxed, false)).toBe(muxed);
  });

  it('returns null for audio-only selection', () => {
    expect(previewableFormat([audioOnly], audioOnly, true)).toBeNull();
  });

  it('returns null for split a/v on non-reddit sources', () => {
    expect(
      previewableFormat([videoOnly], videoOnly, false, 'youtube')
    ).toBeNull();
  });

  it('previews reddit video-only track despite no muxed stream', () => {
    expect(previewableFormat([videoOnly], videoOnly, false, 'reddit')).toBe(
      videoOnly
    );
  });
});
