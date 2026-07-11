import { describe, it, expect } from 'vitest';
import { parseEmbedHtml } from '../src/extractors/spotify/api';

const nextData = (entity: unknown): string =>
  `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    { props: { pageProps: { state: { data: { entity } } } } }
  )}</script></body></html>`;

describe('parseEmbedHtml', () => {
  it('parses a __NEXT_DATA__ entity, picking the largest cover', () => {
    const html = nextData({
      name: 'Song X',
      artists: [{ name: 'Artist Y' }],
      duration: 213000,
      isrcCode: 'USABC1234567',
      coverArt: {
        sources: [
          { url: 'https://i/sm.jpg', width: 64 },
          { url: 'https://i/lg.jpg', width: 640 },
        ],
      },
    });
    expect(parseEmbedHtml(html)).toEqual({
      title: 'Song X',
      artist: 'Artist Y',
      cover: 'https://i/lg.jpg',
      durationMs: 213000,
      isrc: 'USABC1234567',
    });
  });

  it('parses a url-encoded script#resource block', () => {
    const json = JSON.stringify({
      name: 'Track Z',
      artists: [{ name: 'Band Q' }],
      duration_ms: 120000,
      external_ids: { isrc: 'GBXYZ0000001' },
      visualIdentity: {
        image: [{ url: 'https://c/1.jpg' }, { url: 'https://c/2.jpg' }],
      },
    });
    const html = `<script id="resource">${encodeURIComponent(json)}</script>`;
    expect(parseEmbedHtml(html)).toEqual({
      title: 'Track Z',
      artist: 'Band Q',
      cover: 'https://c/2.jpg',
      durationMs: 120000,
      isrc: 'GBXYZ0000001',
    });
  });

  it('uses subtitle as the artist when artists is absent', () => {
    const html = nextData({ name: 'Solo', subtitle: 'DJ Sub', duration: 1000 });
    const out = parseEmbedHtml(html);
    expect(out?.artist).toBe('DJ Sub');
    expect(out?.durationMs).toBe(1000);
  });

  it('returns null when no title is present', () => {
    expect(parseEmbedHtml(nextData({ artists: [{ name: 'No Title' }] }))).toBeNull();
  });

  it('returns null for malformed json with no resource', () => {
    expect(
      parseEmbedHtml('<script id="__NEXT_DATA__">not json</script>')
    ).toBeNull();
  });

  it('extracts previewUrl from audioPreview.url', () => {
    const html = nextData({
      name: 'Previewed Song',
      artists: [{ name: 'Preview Artist' }],
      duration: 30000,
      audioPreview: { url: 'https://p.scdn.co/mp3-preview/abc123' },
    });
    expect(parseEmbedHtml(html)?.previewUrl).toBe(
      'https://p.scdn.co/mp3-preview/abc123'
    );
  });

  it('falls back to preview_url when audioPreview is absent', () => {
    const html = nextData({
      name: 'Fallback Song',
      artists: [{ name: 'Fallback Artist' }],
      preview_url: 'https://p.scdn.co/mp3-preview/xyz789',
    });
    expect(parseEmbedHtml(html)?.previewUrl).toBe(
      'https://p.scdn.co/mp3-preview/xyz789'
    );
  });
});
