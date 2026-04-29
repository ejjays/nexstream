import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const isExternal =
  REDIS_URL.includes('upstash.io') ||
  REDIS_URL.includes('aivencloud.com') ||
  REDIS_URL.includes('valkey');

export const getRedisOptions = (overrides = {}) => {
  return {
    connectTimeout: 20000,
    maxRetriesPerRequest: null,
    keepAlive: 10000,
    retryStrategy(times: number) {
      const delay = Math.min(times * 500, 2000);
      return delay;
    },
    tls: isExternal
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
    ...overrides,
  };
};

export const createRedisClient = (name = 'default') => {
  const client = new Redis(REDIS_URL, getRedisOptions());

  client.on('connect', () => {
    const type = isExternal ? 'External' : 'Local';
    console.log(`[Redis] ${name} connected to ${type} instance`);
  });

  client.on('error', (err: any) => {
    // Only log once to avoid spamming if it's a persistent issue
    if (err.code === 'ETIMEDOUT') {
      console.error(`[Redis] ${name} connection timed out. Check network/whitelisting.`);
    } else {
      console.error(`[Redis] ${name} error: ${err.message}`);
    }
  });

  return client;
};

export default createRedisClient;
