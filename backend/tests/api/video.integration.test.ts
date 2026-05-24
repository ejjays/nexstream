import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

describe('Video API Integration', () => {
  it('GET /ping should return pong', async () => {
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
    expect(res.text).toBe('pong');
  });

  it('GET /health should return 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /info should return 400 for missing URL', async () => {
    const res = await request(app).get('/info');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No valid URL provided');
  });

  it('GET /info should return metadata for valid YouTube URL (Mocked via MSW)', async () => {
    const url = 'https://www.youtube.com/watch?v=nTbA7qrEsP0';
    const res = await request(app).get(`/info?url=${encodeURIComponent(url)}`);
    
    expect(res.status).toBe(200);
    expect(res.body.title).toContain('Mocked');
    expect(res.body.id).toBe('nTbA7qrEsP0');
    expect(res.body.formats.length).toBeGreaterThan(0);
  });

  it('GET /info should return metadata for valid Spotify URL (Mocked via MSW)', async () => {
    const url = 'https://open.spotify.com/track/nTbA7qrEsP0';
    const res = await request(app).get(`/info?url=${encodeURIComponent(url)}`);
    
    expect(res.status).toBe(200);
    expect(res.body.title).toContain('Mocked');
    expect(res.body.isrc).toBeDefined();
  });

  it('POST /telemetry should return 204', async () => {
     const res = await request(app)
       .post('/telemetry')
       .send({ event: 'test', data: {} });
     expect(res.status).toBe(204);
  });

  it('GET /proxy should return 400 for missing url', async () => {
    const res = await request(app).get('/proxy');
    expect(res.status).toBe(400);
  });

  it('GET /stream-urls should return 400 for missing url', async () => {
    const res = await request(app).get('/stream-urls');
    expect(res.status).toBe(400);
  });

  it('POST /convert should return 400 for missing url', async () => {
    const res = await request(app).post('/convert').send({});
    expect(res.status).toBe(400);
  });
});
