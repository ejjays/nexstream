import { describe, it, expect } from 'vitest';
import { computeLift } from '../src/lib/keyboardLift';

describe('computeLift', () => {
  it('returns 0 when the keyboard is hidden', () => {
    expect(computeLift(500, 0, 800, 20)).toBe(0);
  });

  it('returns 0 when the field position is unknown', () => {
    expect(computeLift(0, 300, 800, 20)).toBe(0);
  });

  it('returns 0 when the field already sits above the keyboard', () => {
    // visible bottom = 800 - 300 = 500; field 400 + 20 + 10 = 430 < 500
    expect(computeLift(400, 300, 800, 20)).toBe(0);
  });

  it('lifts by the overlap as a negative translateY', () => {
    // needed = 480 + 20 + 10 - (800 - 300) = 10
    expect(computeLift(480, 300, 800, 20)).toBe(-10);
  });
});
