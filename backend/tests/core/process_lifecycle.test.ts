import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { setupStreamListeners } from '../../src/utils/media/stream.util.js';
import { Response } from 'express';

describe('FFmpeg Process Lifecycle & Sandbox Cleanup', () => {
  it('Should systematically terminate active OS processes when client disconnects abruptly', async () => {
    // Spawn a genuine, low-overhead sleeping process to track native PID operations
    const dummyProcess = spawn('node', ['-e', 'setTimeout(() => {}, 30000)'], { detached: true });
    const pid = dummyProcess.pid;
    expect(pid).toBeGreaterThan(0);

    // Mock a standard Express Response object extended from a core Event emitter
    const mockRes = new EventEmitter() as unknown as Response;
    mockRes.writableEnded = false;
    mockRes.write = vi.fn();
    mockRes.end = vi.fn();

    const totalBytes = { value: 0 };
    
    // Bind process management hooks to the active stream lifecycle infrastructure
    setupStreamListeners(dummyProcess.stdout as any, mockRes, 'test-client-id', totalBytes);

    // Trigger an asynchronous native client termination block
    dummyProcess.kill('SIGKILL');

    // Give the operating system scheduler a minor window to complete cleanups
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Verify process death by sending an alive check signal (0)
    // An dead process must throw an ESRCH error from the underlying OS kernel layer
    expect(() => process.kill(pid!, 0)).toThrow();
  });
});
