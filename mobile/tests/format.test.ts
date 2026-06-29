import { describe, it, expect } from 'vitest';
import {
  formatSize,
  formatLabel,
  dlLabel,
  prettyName,
  refererFor,
  previewableFormat,
  qualityText,
  extLabel,
  isAudioOnly,
  titleFor,
  subtitleFor,
  badgeFor,
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

describe('qualityText', () => {
  it.each<[string, string]>([
    ['4320p', '8K'],
    ['2160p', '4K'],
    ['1440p', '2K'],
  ])('maps %s to a short label', (quality, expected) => {
    expect(qualityText(makeFormat({ quality }))).toBe(expected);
  });

  it('reads the resolution field when quality is absent', () => {
    expect(qualityText(makeFormat({ quality: '', resolution: '3840x2160' }))).toBe(
      '4K'
    );
  });

  it('falls back to formatLabel for other resolutions', () => {
    expect(qualityText(makeFormat({ quality: '1080p' }))).toBe('1080p');
    expect(
      qualityText(makeFormat({ quality: '', resolution: '', formatId: '137' }))
    ).toBe('137');
  });
});

describe('extLabel', () => {
  it('uppercases the extension', () => {
    expect(extLabel(makeFormat({ extension: 'mp4' }))).toBe('MP4');
    expect(extLabel(makeFormat({ extension: 'webm' }))).toBe('WEBM');
  });

  it('falls back to RAW when the extension is missing', () => {
    expect(extLabel(makeFormat({ extension: '' }))).toBe('RAW');
  });
});

describe('isAudioOnly', () => {
  it('is true only for audio without video', () => {
    expect(isAudioOnly(makeFormat({ isAudio: true, isVideo: false }))).toBe(true);
    expect(isAudioOnly(makeFormat({ isAudio: true, isVideo: true }))).toBe(false);
    expect(isAudioOnly(makeFormat({ isAudio: false, isVideo: true }))).toBe(false);
  });
});

describe('titleFor', () => {
  it('uses the extension label for audio-only formats', () => {
    expect(
      titleFor(makeFormat({ isAudio: true, isVideo: false, extension: 'm4a' }))
    ).toBe('M4A');
  });

  it('uses the quality text for video formats', () => {
    expect(titleFor(makeFormat({ quality: '2160p' }))).toBe('4K');
  });
});

describe('subtitleFor', () => {
  const size = 5 * 1024 * 1024; // "5.0 MB"

  it('labels transcoded mp3 as Converted', () => {
    expect(
      subtitleFor(
        makeFormat({
          isAudio: true,
          isVideo: false,
          extension: 'mp3',
          filesize: size,
        })
      )
    ).toBe('Converted · 5.0 MB');
  });

  it('labels native audio as Original', () => {
    expect(
      subtitleFor(
        makeFormat({
          isAudio: true,
          isVideo: false,
          extension: 'm4a',
          filesize: size,
        })
      )
    ).toBe('Original · 5.0 MB');
  });

  it('labels passthrough mp3 (noTranscode) as Original', () => {
    expect(
      subtitleFor(
        makeFormat({
          isAudio: true,
          isVideo: false,
          extension: 'mp3',
          noTranscode: true,
          filesize: size,
        })
      )
    ).toBe('Original · 5.0 MB');
  });

  it('shows size and extension for video', () => {
    expect(subtitleFor(makeFormat({ extension: 'mp4', filesize: size }))).toBe(
      '5.0 MB · MP4'
    );
  });

  it('omits size when it is unknown', () => {
    expect(
      subtitleFor(makeFormat({ isAudio: true, isVideo: false, extension: 'mp3' }))
    ).toBe('Converted');
    expect(subtitleFor(makeFormat({ extension: 'mp4' }))).toBe('MP4');
  });
});

describe('badgeFor', () => {
  it('flags transcoded mp3 as HIGH', () => {
    expect(
      badgeFor(makeFormat({ isAudio: true, isVideo: false, extension: 'mp3' }))
    ).toEqual({ label: 'HIGH', tone: 'cyan' });
  });

  it('flags native audio as MAX', () => {
    expect(
      badgeFor(makeFormat({ isAudio: true, isVideo: false, extension: 'm4a' }))
    ).toEqual({ label: 'MAX', tone: 'amber' });
    expect(
      badgeFor(
        makeFormat({
          isAudio: true,
          isVideo: false,
          extension: 'mp3',
          noTranscode: true,
        })
      )
    ).toEqual({ label: 'MAX', tone: 'amber' });
  });

  it('flags muxed video as muxed', () => {
    expect(badgeFor(makeFormat({ isMuxed: true }))).toEqual({
      label: 'muxed',
      tone: 'cyan',
    });
  });

  it('returns null for split (non-muxed) video', () => {
    expect(badgeFor(makeFormat({ isMuxed: false }))).toBeNull();
  });
});
