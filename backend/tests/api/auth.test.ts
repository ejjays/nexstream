import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

// non-local test client
const REMOTE = '203.0.113.5';

describe('inbound API key auth', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is disabled when API_KEY is unset', async () => {
    vi.stubEnv('API_KEY', '');
    const res = await request(app).get('/proxy').set('X-Forwarded-For', REMOTE);
    expect(res.status).toBe(403);
  });

  it('returns 401 for a remote request with no key', async () => {
    vi.stubEnv('API_KEY', 'secret');
    const res = await request(app).get('/proxy').set('X-Forwarded-For', REMOTE);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong key', async () => {
    vi.stubEnv('API_KEY', 'secret');
    const res = await request(app)
      .get('/proxy')
      .set('X-Forwarded-For', REMOTE)
      .set('x-api-key', 'nope');
    expect(res.status).toBe(401);
  });

  it('accepts a correct key header (then hits the 403 sig gate)', async () => {
    vi.stubEnv('API_KEY', 'secret');
    const res = await request(app)
      .get('/proxy')
      .set('X-Forwarded-For', REMOTE)
      .set('x-api-key', 'secret');
    expect(res.status).toBe(403);
  });

  it('accepts a correct ?key= query', async () => {
    vi.stubEnv('API_KEY', 'secret');
    const res = await request(app)
      .get('/proxy?key=secret')
      .set('X-Forwarded-For', REMOTE);
    expect(res.status).toBe(403);
  });

  it('exempts localhost even with no key', async () => {
    vi.stubEnv('API_KEY', 'secret');
    const res = await request(app).get('/proxy');
    expect(res.status).toBe(403);
  });
});
