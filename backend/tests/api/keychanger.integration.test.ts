import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

describe('KeyChanger API Integration', () => {
  it('POST /api/key-changer/detect should return 400 if no file', async () => {
    const res = await request(app).post('/api/key-changer/detect');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No file uploaded');
  });

  it('GET /api/key-changer/detect-processed/:filename should return 404 if not found', async () => {
    const res = await request(app).get(
      '/api/key-changer/detect-processed/non-existent.mp3'
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('File not found');
  });

  it('POST /api/key-changer/convert should return 400 if no file', async () => {
    const res = await request(app).post('/api/key-changer/convert');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No file uploaded');
  });

  it('GET /api/key-changer/download/:filename should return 404 if not found', async () => {
    const res = await request(app).get(
      '/api/key-changer/download/non-existent.mp3'
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('File not found');
  });
});
