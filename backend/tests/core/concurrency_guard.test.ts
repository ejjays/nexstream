import { describe, it, expect, vi } from 'vitest';
import { globalMediaGuard } from '../../src/utils/network/security.util.js';
import type { Request, Response } from 'express';

function mockRes() {
  const handlers: Record<string, () => void> = {};
  const res = {
    statusCode: 0,
    on(event: string, handler: () => void) {
      handlers[event] = handler;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json: vi.fn(),
    fire(event: string) {
      handlers[event]?.();
    },
  };
  return res as unknown as Response & { statusCode: number; fire: (e: string) => void };
}

describe('globalMediaGuard', () => {
  it('caps concurrent jobs and frees the slot on release', () => {
    const guard = globalMediaGuard(1);
    const req = {} as Request;

    const res1 = mockRes();
    const next1 = vi.fn();
    guard(req, res1, next1);
    expect(next1).toHaveBeenCalledOnce();

    const res2 = mockRes();
    const next2 = vi.fn();
    guard(req, res2, next2);
    expect(next2).not.toHaveBeenCalled();
    expect(res2.statusCode).toBe(503);

    res1.fire('close');

    const res3 = mockRes();
    const next3 = vi.fn();
    guard(req, res3, next3);
    expect(next3).toHaveBeenCalledOnce();
  });
});
