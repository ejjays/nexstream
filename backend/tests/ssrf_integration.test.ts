import { describe, it, expect, vi } from 'vitest';
import { pipeWebStream } from '../src/utils/proxy.util.js';
import { Response } from 'express';

describe('SSRF Integration: pipeWebStream', () => {
  it('blocks request to 127.0.0.1', async () => {
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      end: vi.fn(),
      headersSent: false
    } as unknown as Response;

    await expect(pipeWebStream('http://127.0.0.1:6379', mockRes))
      .rejects.toThrow(/SSRF Blocked/);
  });

  it('blocks request to localtest.me', async () => {
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      end: vi.fn(),
      headersSent: false
    } as unknown as Response;

    await expect(pipeWebStream('http://localtest.me', mockRes))
      .rejects.toThrow(/SSRF Blocked/);
  });

  it('allows request to a public domain (Google)', async () => {
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      headersSent: false,
      getHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      emit: vi.fn(),
      removeListener: vi.fn(),
    } as unknown as Response;

    let ssrfBlocked = false;
    try {
        await pipeWebStream('https://www.google.com/robots.txt', mockRes, 'robots.txt');
    } catch (err: unknown) {
        if (err instanceof Error && /SSRF Blocked/.test(err.message)) {
            ssrfBlocked = true;
        }
    }
    expect(ssrfBlocked).toBe(false);
  });
});
