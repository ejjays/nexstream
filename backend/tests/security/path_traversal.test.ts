import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

// encoded ../.. survives url normalization
const UP_TWO = '%2e%2e%2f%2e%2e';

describe('path traversal hardening', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('rejects traversal on /api/remix/stems/:id/:file', async () => {
    vi.stubEnv('API_KEY', '');
    const res = await request(app).get(
      `/api/remix/stems/${UP_TWO}/package.json`
    );
    expect(res.status).toBe(400);
    expect(res.text).not.toContain('"name": "backend"');
  });

  it('rejects traversal on keychanger /download/:filename', async () => {
    vi.stubEnv('API_KEY', '');
    const res = await request(app).get(
      `/api/key-changer/download/${UP_TWO}%2fpackage.json`
    );
    expect(res.status).toBe(400);
    expect(res.text).not.toContain('"name": "backend"');
  });

  it('rejects traversal on keychanger /detect-processed/:filename', async () => {
    vi.stubEnv('API_KEY', '');
    const res = await request(app).get(
      `/api/key-changer/detect-processed/${UP_TWO}%2fpackage.json`
    );
    expect(res.status).toBe(400);
  });
});
