import { describe, it, expect } from 'vitest';
import { withRetry } from '../src/lib/retry';

describe('withRetry', () => {
  it('returns on first success without retrying', async () => {
    let calls = 0;
    const out = await withRetry(
      () => {
        calls += 1;
        return Promise.resolve('ok');
      },
      { retries: 3 }
    );
    expect(out).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries until a later attempt succeeds', async () => {
    let calls = 0;
    const out = await withRetry(
      () => {
        calls += 1;
        if (calls < 3) return Promise.reject(new Error('flaky'));
        return Promise.resolve(calls);
      },
      { retries: 3 }
    );
    expect(out).toBe(3);
    expect(calls).toBe(3);
  });

  it('throws the last error after exhausting retries', async () => {
    let calls = 0;
    await expect(
      withRetry(
        () => {
          calls += 1;
          return Promise.reject(new Error(`fail ${calls}`));
        },
        { retries: 2 }
      )
    ).rejects.toThrow('fail 3');
    expect(calls).toBe(3);
  });

  it('passes a zero-based attempt index to the task', async () => {
    const seen: number[] = [];
    await withRetry(
      (attempt) => {
        seen.push(attempt);
        if (attempt < 2) return Promise.reject(new Error('again'));
        return Promise.resolve(true);
      },
      { retries: 5 }
    );
    expect(seen).toEqual([0, 1, 2]);
  });
});
