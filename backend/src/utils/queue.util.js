const { Queue } = require('bullmq');
const Redis = require('ioredis');

const isExternal =
  process.env.REDIS_URL &&
  (process.env.REDIS_URL.includes('upstash.io') ||
    process.env.REDIS_URL.includes('aivencloud.com') ||
    process.env.REDIS_URL.includes('valkey'));

const connection = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  {
    maxRetriesPerRequest: null,
    tls: isExternal
      ? {
          rejectUnauthorized: false
        }
      : undefined
  }
);

connection.on('connect', () => {
  const type = isExternal ? 'Redis (Aiven)' : 'Local';
  console.log(`✅ Connected to ${type} instance`);
});

connection.on('error', err => {
  console.error(`❌  Redis nConnection error: ${err.message}`);
});

// task queue
const downloadQueue = new Queue('downloads', {
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

module.exports = {
  downloadQueue,
  connection
};
