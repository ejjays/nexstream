import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import fs from 'node:fs';

// Mock fluent-ffmpeg chainable interface
vi.mock('fluent-ffmpeg', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      audioFilters: vi.fn().mockReturnThis(),
      on: vi.fn().mockImplementation(function(this: any, event: string, callback: any) {
        if (event === 'end') setTimeout(() => callback(), 10); // Simulate processing completion
        return this;
      }),
      save: vi.fn().mockImplementation(function(this: any, outputPath: string) {
        // Create an empty dummy file to pass fs.existsSync checks downstream
        fs.writeFileSync(outputPath, 'dummy audio data');
        return this;
      }),
    })),
  };
});

describe('KeyChanger API - Happy Path', () => {
  it('POST /api/key-changer/convert should process audio file and return download URL', async () => {
    // Generate a physical dummy file for multer to digest
    const testFilePath = './tests/fixtures/test_song.mp3';
    fs.mkdirSync('./tests/fixtures', { recursive: true });
    fs.writeFileSync(testFilePath, 'fake mp3 frame headers');

    const res = await request(app)
      .post('/api/key-changer/convert')
      .attach('song', testFilePath)
      .field('originalKey', 'C')
      .field('targetKey', 'G');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.downloadUrl).toContain('/api/key-changer/download/');

    // Cleanup local test artifacts safely
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
  });
});
