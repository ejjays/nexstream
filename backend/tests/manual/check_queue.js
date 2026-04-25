const { Queue } = require('bullmq');
const Redis = require('ioredis');

async function checkQueue() {
  const connection = new Redis();
  const queue = new Queue('downloads', { connection });

  console.log('--- Queue Health Check ---');
  const counts = await queue.getJobCounts();
  console.log('Job Counts:', JSON.stringify(counts, null, 2));

  const active = await queue.getActive();
  console.log('Active Jobs:', active.length);

  const waiting = await queue.getWaiting();
  console.log('Waiting Jobs:', waiting.length);

  await connection.quit();
  process.exit(0);
}

checkQueue().catch(err => {
  console.error(err);
  process.exit(1);
});
