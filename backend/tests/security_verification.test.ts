import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE_URL = process.env.TEST_URL || 'http://localhost:5000';

describe('Security Protections Verification', () => {

  it('Rate Limiting: blocks excessive requests to /info', async () => {
    const responses = [];
    // The limit is 15 per minute. Let's try 20.
    for (let i = 0; i < 20; i++) {
      const res = await fetch(`${BASE_URL}/info?url=https://www.youtube.com/watch?v=aqz-KE-bpKQ`);
      responses.push(res.status);
      if (res.status === 429) break;
    }
    
    expect(responses).toContain(429);
    console.log(`[Test] Rate limit triggered after ${responses.length} requests.`);
  });

  it('Concurrency Guard: blocks simultaneous downloads from same IP', async () => {
    // The limit is 2. Let's try 3.
    // Note: This requires the server to be running and a real/mocked download to stay active.
    // We'll call /convert which triggers a lock.
    
    const makeRequest = () => fetch(`${BASE_URL}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', format: 'mp3' })
    });

    const res1 = await makeRequest();
    const res2 = await makeRequest();
    const res3 = await makeRequest();

    const statuses = [res1.status, res2.status, res3.status];
    console.log('[Test] Concurrency Statuses:', statuses);
    
    expect(statuses).toContain(429);
    
    // Cleanup: Disconnect to release locks (req.on('close') triggers releaseLock)
  });

});
