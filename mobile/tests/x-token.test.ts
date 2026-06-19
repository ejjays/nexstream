import { describe, it, expect } from 'vitest';
import { tweetToken } from '../src/extractors/x';

describe('tweetToken', () => {
  it('is deterministic, dot-free and input-sensitive', () => {
    const token = tweetToken('1599337745803882496');
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(token).not.toContain('.');
    expect(tweetToken('1599337745803882496')).toBe(token);
    expect(tweetToken('20')).not.toBe(token);
  });
});
