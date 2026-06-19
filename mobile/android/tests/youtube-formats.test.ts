import { describe, it, expect } from 'vitest';
import { buildFormats } from '../src/extractors/youtube';
import type { RawYtResult } from '../src/extractors/youtube/bridge';

describe('youtube buildFormats', () => {
  it('pairs a video-only rung with the best audio and appends original + mp3 audio', () => {
    const raw: RawYtResult = {
      id: 'vid',
      formats: [
        {
          itag: 18,
          url: 'https://m.example/360.mp4',
          mimeType: 'video/mp4',
          width: 640,
          height: 360,
          hasVideo: true,
          hasAudio: true,
          qualityLabel: '360p',
        },
      ],
      adaptive: [
        {
          itag: 137,
          url: 'https://v.example/1080.mp4',
          mimeType: 'video/mp4',
          width: 1920,
          height: 1080,
          hasVideo: true,
          hasAudio: false,
          qualityLabel: '1080p',
        },
        {
          itag: 140,
          url: 'https://a.example/aac.m4a',
          mimeType: 'audio/mp4',
          hasVideo: false,
          hasAudio: true,
          bitrate: 128000,
          audioQuality: 'AUDIO_QUALITY_MEDIUM',
        },
      ],
    };

    const formats = buildFormats(raw);
    expect(formats).toHaveLength(4);

    const top = formats[0];
    expect(top.height).toBe(1080);
    expect(top.formatId).toBe('137');
    expect(top.muxAudioUrl).toBe('https://a.example/aac.m4a');
    expect(top.isMuxed).toBe(false);

    expect(formats[1].height).toBe(360);
    expect(formats[1].isMuxed).toBe(true);

    const original = formats.find((f) => f.quality === 'Original');
    expect(original?.isAudio).toBe(true);
    expect(original?.isVideo).toBe(false);
    expect(original?.extension).toBe('m4a');

    const mp3 = formats.find((f) => f.formatId === 'mp3');
    expect(mp3?.extension).toBe('mp3');
    expect(mp3?.acodec).toBe('mp3');
    expect(mp3?.isAudio).toBe(true);
  });
});
