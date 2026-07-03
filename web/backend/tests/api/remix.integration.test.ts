import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

describe('Remix API Integration', () => {
  it('POST /api/remix/register-engine should return 400 for missing data', async () => {
    const res = await request(app).post('/api/remix/register-engine');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('URL and session_id required');
  });

  it('GET /api/remix/engine-status should return error if no session_id', async () => {
    const res = await request(app).get('/api/remix/engine-status');
    expect(res.body.error).toBe('session_id required');
  });

  it('POST /api/remix/process should return 400 if no engine registered', async () => {
    const res = await request(app)
      .post('/api/remix/process')
      .field('session_id', 'unknown');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Engine not connected or session expired');
  });

  it('GET /api/remix/history should return history (empty initially)', async () => {
    const res = await request(app).get('/api/remix/history');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
