import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/utils/infra/db.util.js';
import { createRedisClient } from '../../src/utils/infra/redis.util.js';

describe('Infrastructure Fault Injection', () => {
  it('Should handle Turso Database mid-flight dropouts without crashing', async () => {
    // Inject a fatal connection error directly into the DB client execution path
    vi.spyOn(db, 'execute').mockRejectedValueOnce(new Error('LibSQL Client Error: Cannot reach remote database'));

    const res = await request(app).get('/info?url=https://open.spotify.com/track/404');
    
    // The application should gracefully catch the DB failure and fallback to alternative extraction
    // returning a successful 200 OK
    expect(res.status).toBe(200);
  });

  it('Should survive Redis connection timeouts during heavy concurrency checks', async () => {
    const mockClient = createRedisClient('security');
    vi.spyOn(mockClient as any, 'incr').mockRejectedValueOnce(new Error('Redis command timeout (ETIMEDOUT)'));

    const res = await request(app)
      .post('/convert')
      .send({ url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', format: 'mp3' });

    // Since the concurrency guard relies on Redis, an unhandled rejection there
    // should propagate safely up to Express's 500 handler, bypassing stream hang-ups
    expect(res.status).toBe(500);
  });
});
