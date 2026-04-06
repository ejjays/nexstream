const { Queue } = require('bullmq');
const Redis = require('ioredis');

async function testAddJob() {
  const connection = new Redis();
  const queue = new Queue('downloads', { connection });

  console.log('Adding test job to BullMQ...');
  const job = await queue.add('lock', { weight: 1 });
  console.log(`Job added! ID: ${job.id}`);

  await connection.quit();
}

testAddJob().catch(console.error);
