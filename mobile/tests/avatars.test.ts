import { describe, it, expect } from 'vitest';
import {
  PRESET_PREFIX,
  presetMarker,
  isPresetMarker,
  presetIdOf,
} from '../src/lib/avatars.logic';

describe('avatar preset markers', () => {
  it('round-trips an id through marker and back', () => {
    expect(presetMarker('07')).toBe('preset:07');
    expect(presetIdOf(presetMarker('07'))).toBe('07');
  });

  it('detects preset markers vs real urls and empties', () => {
    expect(isPresetMarker('preset:01')).toBe(true);
    expect(isPresetMarker('https://example.com/a.jpg')).toBe(false);
    expect(isPresetMarker('')).toBe(false);
    expect(isPresetMarker(null)).toBe(false);
    expect(isPresetMarker(undefined)).toBe(false);
  });

  it('returns null id for non-preset values', () => {
    expect(presetIdOf('https://example.com/a.jpg')).toBeNull();
    expect(presetIdOf(null)).toBeNull();
    expect(presetIdOf(undefined)).toBeNull();
  });

  it('exposes the marker prefix', () => {
    expect(PRESET_PREFIX).toBe('preset:');
  });
});
