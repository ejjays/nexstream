import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import path from 'node:path';

describe('KeyChanger API - Happy Path', () => {
  it('POST /api/key-changer/convert should process audio file and return download URL', async () => {
    // valid fixture
    const testFilePath = path.resolve(__dirname, '../fixtures/audio/minimal_sine.mp3');

    const res = await request(app)
      .post('/api/key-changer/convert')
      .attach('song', testFilePath)
      .field('originalKey', 'C')
      .field('targetKey', 'G');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.downloadUrl).toContain('/api/key-changer/download/');
  }, 15000); // ffmpeg delay
});

