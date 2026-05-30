import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

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
          rejectUnauthorized: true,
        }
      : undefined,
    ...overrides,
  };
};

const loggedErrors = new Set<string>();
const redisInstances = new Map<string, Redis>();

export const createRedisClient = (name = 'default') => {
  const existing = redisInstances.get(name);
  if (existing) return existing;

  const client = new Redis(REDIS_URL, getRedisOptions());
  redisInstances.set(name, client);

  client.on('connect', () => {
    const type = isExternal ? 'External' : 'Local';
    console.log(`[Redis] ${name} connected to ${type} instance`);
    loggedErrors.delete(`${name}_connect_error`);
  });

  client.on('error', (err: NodeJS.ErrnoException) => {
    const errorKey = `${name}_${err.code || 'error'}`;

    // throttle error logs
    if (!loggedErrors.has(errorKey)) {
      if (err.code === 'ETIMEDOUT') {
        console.error(
          `[Redis] ${name} connection timed out. Check network/whitelisting.`
        );
      } else if (err.code === 'ECONNREFUSED') {
        console.error(
          `[Redis] ${name} connection refused. Is Redis running locally?`
        );
      } else {
        console.error(`[Redis] ${name} error: ${err.message}`);
      }
      loggedErrors.add(errorKey);

      // reset error log
      setTimeout(() => loggedErrors.delete(errorKey), 300000);
    }
  });

  return client;
};

export default createRedisClient;

// quit all tracked clients on shutdown
export const closeAllRedis = async (): Promise<void> => {
  for (const client of redisInstances.values()) {
    // disconnect is immediate; quit can hang offline
    try {
      client.disconnect();
    } catch {
      // ignore disconnect errors
    }
  }
  redisInstances.clear();
  await Promise.resolve();
};
