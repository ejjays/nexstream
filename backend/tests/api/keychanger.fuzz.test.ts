import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import path from 'node:path';

describe('KeyChanger API - Fuzzing & Corrupt Payloads', () => {
  it('POST /api/key-changer/convert should gracefully reject non-audio payloads without crashing', async () => {
    // corrupt file
    const corruptFilePath = path.resolve(
      __dirname,
      '../fixtures/audio/corrupted_payload.mp3'
    );

    const res = await request(app)
      .post('/api/key-changer/convert')
      .attach('song', corruptFilePath)
      .field('originalKey', 'C')
      .field('targetKey', 'G');

    // verify error
    // check 500
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
    expect(res.body.success).toBeUndefined();
  }, 10000);
});
