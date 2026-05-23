import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = process.env.TEST_URL || 'http://localhost:5000';

describe('Security Protections Verification', () => {
  let isServerUp = false;

  beforeAll(async () => {
    try {
      const res = await fetch(`${BASE_URL}/ping`).catch(() => null);
      isServerUp = res !== null && res.status === 200;
    } catch {
      isServerUp = false;
    }
  });

  it('Rate Limiting: blocks excessive requests to /info', async () => {
    if (!isServerUp) {
      console.warn(
        `[Test Skip] Server down at ${BASE_URL}. Skipping rate limit test.`
      );
      return;
    }

    const responses = [];
    // test limit
    for (let i = 0; i < 20; i++) {
      const res = await fetch(
        `${BASE_URL}/info?url=https://www.youtube.com/watch?v=aqz-KE-bpKQ`
      );
      responses.push(res.status);
      if (res.status === 429) break;
    }

    expect(responses).toContain(429);
    console.log(
      `[Test] Rate limit triggered after ${responses.length} requests.`
    );
  });

  it('Concurrency Guard: blocks simultaneous downloads from same IP', async () => {
    if (!isServerUp) {
      console.warn(
        `[Test Skip] Server down at ${BASE_URL}. Skipping concurrency test.`
      );
      return;
    }

    const makeRequest = () =>
      fetch(`${BASE_URL}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
          format: 'mp3',
        }),
      });

    const [res1, res2, res3] = await Promise.all([
      makeRequest(),
      makeRequest(),
      makeRequest(),
    ]);

    const statuses = [res1.status, res2.status, res3.status];
    console.log('[Test] Concurrency Statuses:', statuses);

    expect(statuses).toContain(429);
  });

  it('Stability: light requests (/ping) should NOT be subject to concurrency guard', async () => {
    if (!isServerUp) return;

    const heavyUrl = `${BASE_URL}/convert`;
    const body = JSON.stringify({
      url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      format: 'mp3',
    });

    fetch(heavyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    fetch(heavyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const pingRes = await fetch(`${BASE_URL}/ping`);

    expect(pingRes.status).toBe(200);
    console.log('[Test] Simple request (/ping) passed through correctly.');
  });
});
