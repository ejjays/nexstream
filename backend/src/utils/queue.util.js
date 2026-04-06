const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis({
  maxRetriesPerRequest: null,
});

// downloader queue
const downloadQueue = new Queue('downloads', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

module.exports = {
  downloadQueue,
  connection,
};
