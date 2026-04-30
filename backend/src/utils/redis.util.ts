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

const loggedErrors = new Set<string>();

export const createRedisClient = (name = 'default') => {
  const client = new Redis(REDIS_URL, getRedisOptions());

  client.on('connect', () => {
    const type = isExternal ? 'External' : 'Local';
    console.log(`[Redis] ${name} connected to ${type} instance`);
    loggedErrors.delete(`${name}_connect_error`);
  });

  client.on('error', (err: any) => {
    const errorKey = `${name}_${err.code || 'error'}`;
    
    // Only log if we haven't logged this specific error for this client recently
    if (!loggedErrors.has(errorKey)) {
      if (err.code === 'ETIMEDOUT') {
        console.error(`[Redis] ${name} connection timed out. Check network/whitelisting.`);
      } else if (err.code === 'ECONNREFUSED') {
        console.error(`[Redis] ${name} connection refused. Is Redis running locally?`);
      } else {
        console.error(`[Redis] ${name} error: ${err.message}`);
      }
      loggedErrors.add(errorKey);
      
      // Reset error log after 5 minutes to allow re-notifying if it persists
      setTimeout(() => loggedErrors.delete(errorKey), 300000);
    }
  });

  return client;
};

export default createRedisClient;
