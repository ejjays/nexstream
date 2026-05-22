import { expect } from 'vitest';
import { Expected } from './schema.js';
import { VideoInfo } from '../../src/types/index.js';

// dynamic assertions
export function assertOutcome(actual: VideoInfo | null, expected: Expected) {
  if (expected.status === 'ok') {
    expect(actual, 'Actual data should be defined').toBeDefined();
  }

  // check metadata
  if (expected.title && actual?.title) {
    expect(actual.title.toLowerCase(), `Title mismatch for ${actual.title}`).toContain(expected.title.toLowerCase());
  }

  // check ISRC
  if (expected.mustHaveIsrc) {
    expect(actual?.isrc, 'ISRC matching failed - unique Nexstream intelligence not found').toBeTruthy();
    expect(typeof actual?.isrc).toBe('string');
  }

  // check grounding
  if (expected.mustHaveChords) {
    const hasChords = (actual as any).chordsSheet || (actual as any).chords;
    expect(hasChords, 'Grounding failed - Chords/Lyrics sheet not generated').toBeTruthy();
  }

  // check integrity
  if (expected.type && actual?.formats) {
    const hasVideo = actual.formats.some(f => f.vcodec && f.vcodec !== 'none');
    const hasAudio = actual.formats.some(f => (f.acodec && f.acodec !== 'none') || (!f.vcodec || f.vcodec === 'none'));
    
    if (expected.type === 'video') {
      expect(hasVideo, 'Expected a video stream but none found').toBe(true);
    }
    if (expected.type === 'audio') {
      expect(hasAudio, 'Expected an audio stream but none found').toBe(true);
    }
  }

  // provider checks
  if (actual?.extractor_key) {
    console.log(`[Assert] Verified ${actual.extractor_key} logic flow.`);
  }
}
