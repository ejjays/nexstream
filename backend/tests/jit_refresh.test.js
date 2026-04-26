
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as spotifyIdx from '../src/services/spotify/index';
import * as brain from '../src/services/spotify/brain';

// mock brain updates
vi.spyOn(brain, 'updatePreviewInBrain').mockImplementation(() => Promise.resolve());

describe('JIT Refresh Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should refresh expiring Deezer links', async () => {
    const brainData = {
      title: 'Risk It All',
      artist: 'Bruno Mars',
      previewUrl: 'https://cdnt-preview.dzcdn.net/api/1/1/expired',
      isrc: 'FR2X41721331',
      duration: 204000
    };

    await spotifyIdx.refreshPreviewIfNeeded('https://open.spotify.com/track/test', brainData);

    // expect MSW mock
    expect(brainData.previewUrl).toBe('https://example.com/preview.mp3');
  });

  it('should refresh expiring iTunes links', async () => {
    const brainData = {
      title: 'Risk It All',
      artist: 'Bruno Mars',
      previewUrl: 'https://audio-ssl.itunes.apple.com/expired.m4a',
      isrc: 'FR2X41721331'
    };

    await spotifyIdx.refreshPreviewIfNeeded('https://open.spotify.com/track/test', brainData);

    expect(brainData.previewUrl).toBe('https://example.com/preview.mp3');
  });

  it('should ignore static CDNs', async () => {
    const staticUrl = 'https://my-cdn.com/static.mp3';
    const brainData = {
      title: 'Risk It All',
      artist: 'Bruno Mars',
      previewUrl: staticUrl,
      isrc: 'USAT22509142'
    };

    await spotifyIdx.refreshPreviewIfNeeded('https://open.spotify.com/track/test', brainData);

    expect(brainData.previewUrl).toBe(staticUrl);
  });
});
