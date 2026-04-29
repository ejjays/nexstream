import { Queue } from 'bullmq';
import { createRedisClient, getRedisOptions } from './redis.util.js';

// BullMQ needs its own connection instances for stability
export const connection = createRedisClient('Queue');

export const downloadQueue = new Queue('downloads', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});
