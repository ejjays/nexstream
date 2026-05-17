import { Worker } from 'bullmq';
import { connection } from '../../utils/queue.util.js';
import os from 'node:os';

const downloadWorker = new Worker('downloads', async (job) => {
  const { weight } = job.data;
  
  if (job.name === 'lock') {
    console.log(`[Worker] Locking weight: ${weight || 1} (Job ${job.id})`);
    await new Promise(r => setTimeout(r, 2000));
    return { success: true };
  }
}, { 
  connection,
  concurrency: Math.max(1, os.cpus().length - 1)
});

downloadWorker.on('completed', job => {
  console.log(`[Worker] Job ${job?.id} finished`);
});

downloadWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
});

export default downloadWorker;
