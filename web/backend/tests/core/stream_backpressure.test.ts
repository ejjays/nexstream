import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import path from 'node:path';

describe('Stream Backpressure & OOM Prevention', () => {
  it('Should respect highWaterMark and manage backpressure properly', async () => {
    // loop output
    const fixturePath = path.resolve(
      __dirname,
      '../fixtures/audio/minimal_sine.mp3'
    );
    const ffmpegProcess = spawn('ffmpeg', [
      '-stream_loop',
      '10', // fill buffers
      '-i',
      fixturePath,
      '-f',
      'mp3',
      'pipe:1',
    ]);

    const mockClientRes = new PassThrough({ highWaterMark: 1024 });
    ffmpegProcess.stdout.pipe(mockClientRes);

    const startTime = Date.now();

    const interval = setInterval(() => {
      mockClientRes.read(100);
    }, 50);

    await new Promise<void>((resolve, reject) => {
      ffmpegProcess.on('close', () => resolve());
      ffmpegProcess.on('error', reject);

      // safety timeout
      setTimeout(() => {
        ffmpegProcess.kill('SIGKILL');
        resolve();
      }, 5000);
    });

    clearInterval(interval);

    const duration = Date.now() - startTime;
    expect(duration).toBeGreaterThan(1000);
  }, 10000);
});
