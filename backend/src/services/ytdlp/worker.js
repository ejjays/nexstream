const { Worker } = require('bullmq');
const { connection } = require('../../utils/queue.util');

// define worker
const downloadWorker = new Worker('downloads', async (job) => {
  const { weight } = job.data;
  
  if (job.name === 'lock') {
    // track process weight
    console.log(`[Worker] Locking weight: ${weight || 1} (Job ${job.id})`);
    
    // simulation: hold process for 2s
    await new Promise(r => setTimeout(r, 2000));
    
    return { success: true };
  }
}, { 
  connection,
  concurrency: 1 // limit for android
});

downloadWorker.on('completed', job => {
  console.log(`[Worker] Job ${job.id} finished`);
});

downloadWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job.id} failed: ${err.message}`);
});

module.exports = downloadWorker;
