import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/node';
import request from 'supertest';
import app from '../../src/app.js';

// Isolate Sentry layers to verify accurate ingestion behaviors
vi.mock('@sentry/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentry/node')>();
  return {
    ...actual,
    captureException: vi.fn(),
  };
});

vi.mock('../../src/utils/network/cookie.util.js', () => ({
  getCookieArgs: vi.fn().mockRejectedValue(new Error('Fatal System Crash'))
}));

describe('Telemetry & Observability Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Should capture unexpected exceptions inside handlers and pass them to Sentry', async () => {
    // Send an execution frame that will explode
    await request(app)
      .get('/info?url=https://www.youtube.com/watch?v=123')
      .send();

    // Assert that the global logger framework reported the structural failure cleanly
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
