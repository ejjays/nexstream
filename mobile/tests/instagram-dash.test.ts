import { describe, it, expect, vi } from 'vitest';

// instagram.ts pulls native-only modules at import; stub for node
vi.mock('../src/lib/net', () => ({ gatedFetch: vi.fn(), mapLimit: vi.fn() }));
vi.mock('../src/lib/authFetch', () => ({ cookieGet: vi.fn() }));

import { parseDashManifest } from '../src/extractors/instagram';

const rep = (attrs: string, url: string): string =>
  `<Representation ${attrs}><BaseURL>${url}</BaseURL></Representation>`;

describe('parseDashManifest', () => {
  it('collects video reps and the highest-bandwidth audio', () => {
    const manifest = `<MPD>${[
      rep(
        'mimeType="video/mp4" width="640" height="360"',
        'https://v.example/360.mp4'
      ),
      rep(
        'mimeType="video/mp4" width="1920" height="1080"',
        'https://v.example/1080.mp4'
      ),
      rep(
        'mimeType="audio/mp4" bandwidth="128000"',
        'https://a.example/lo.m4a'
      ),
      rep(
        'mimeType="audio/mp4" bandwidth="256000"',
        'https://a.example/hi.m4a'
      ),
    ].join('')}</MPD>`;

    const result = parseDashManifest(manifest);
    expect(result.videos.map((v) => v.height)).toEqual([360, 1080]);
    expect(result.audioUrl).toBe('https://a.example/hi.m4a');
  });

  it('dedupes video reps by resolution', () => {
    const manifest = `<MPD>${[
      rep(
        'mimeType="video/mp4" width="1920" height="1080"',
        'https://v.example/a.mp4'
      ),
      rep(
        'mimeType="video/mp4" width="1920" height="1080"',
        'https://v.example/b.mp4'
      ),
    ].join('')}</MPD>`;

    const result = parseDashManifest(manifest);
    expect(result.videos).toHaveLength(1);
  });
});
