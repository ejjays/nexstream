import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { setupStreamListeners } from '../../src/utils/media/stream.util.js';
import { Response } from 'express';
import path from 'node:path';
import { Readable } from 'node:stream';

describe('FFmpeg Process Lifecycle & Sandbox Cleanup', () => {
  it('Should systematically terminate active OS processes when client disconnects abruptly', async () => {
    // spawn FFmpeg
    // loop process
    const fixturePath = path.resolve(
      __dirname,
      '../fixtures/audio/minimal_sine.mp3'
    );
    const dummyProcess = spawn(
      'ffmpeg',
      [
        '-stream_loop',
        '-1', // loop indefinitely
        '-i',
        fixturePath,
        '-f',
        'mp3',
        'pipe:1',
      ],
      { detached: true }
    );

    const pid = dummyProcess.pid;
    expect(pid).toBeGreaterThan(0);

    // mock Response
    const mockRes = new EventEmitter() as unknown as Response;
    mockRes.writableEnded = false;
    mockRes.write = vi.fn();
    mockRes.end = vi.fn();

    const totalBytes = { value: 0 };

    // bind hooks
    setupStreamListeners(
      dummyProcess.stdout as unknown as Readable,
      mockRes,
      'test-client-id',
      totalBytes
    );

    // wait init
    await new Promise((resolve) => setTimeout(resolve, 50));

    // trigger kill
    dummyProcess.kill('SIGKILL');

    // wait cleanup
    await new Promise((resolve) => setTimeout(resolve, 150));

    // verify death
    // expect ESRCH
    expect(() => process.kill(pid as number, 0)).toThrow();
  });
});
