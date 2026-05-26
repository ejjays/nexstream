import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';

// bypass mocks
vi.unmock('ioredis');

import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

let redisAvailable = false;

beforeAll(async () => {
  const probe = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    lazyConnect: true,
  });
  try {
    await probe.connect();
    await probe.ping();
    redisAvailable = true;
  } catch {
    redisAvailable = false;
  } finally {
    probe.disconnect();
  }
});

describe('BullMQ Infrastructure Engine Integration', () => {
  let connection: Redis;
  let testQueue: Queue;
  let testWorker: Worker;

  beforeEach(() => {
    if (!redisAvailable) return;
    // configure Redis
    connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: null
    });
    testQueue = new Queue('test_downloads', { connection });
  });

  afterEach(async () => {
    if (!redisAvailable) return;
    if (testWorker) await testWorker.close();
    if (testQueue) await testQueue.close();
    if (connection) {
      await connection.flushdb();
      await connection.quit();
    }
  });

  it('Should successfully dispatch, pick up, and drain tasks via the localized pipeline', async () => {
    if (!redisAvailable) {
      console.log('[Queue Integration] Redis not available — skipping test');
      return;
    }

    const jobPromise = new Promise<void>((resolve) => {
      testWorker = new Worker('test_downloads', (job) => {
        expect(job.data.weight).toBe(1);
        resolve();
      }, { connection });
    });

    await testQueue.add('lock', { weight: 1 });
    await expect(jobPromise).resolves.not.toThrow();
  });
});
