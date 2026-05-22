import { Worker, Job } from 'bullmq';
import { connection } from '../../utils/queue.util.js';
import os from 'node:os';
import * as Sentry from '@sentry/node';
import { DistributedMediaFSM } from '../../utils/fsm.util.js';

// worker logic
export const processDownloadJob = async (job: Job) => {
  return await Sentry.withIsolationScope(async (scope) => {
    scope.setTag('job_id', job.id);
    scope.setTag('job_name', job.name);
 
    // init distributed fsm
    const fsm = new DistributedMediaFSM(job);
    let state = fsm.getState();
 
    try {
      const { weight } = job.data;
      
      if (job.name === 'lock') {
        if (state === 'PENDING') {
          await fsm.transition('METADATA_EXTRACTING', 'Acquiring resources');
          console.log(`[Worker] Locking weight: ${weight || 1} (Job ${job.id})`);
          await fsm.transition('METADATA_READY', 'Success', { meta: 'locked' });
          state = 'METADATA_READY';
        }

        if (state === 'METADATA_READY') {
          await fsm.transition('DOWNLOADING', 'Starting secure download');
          // simulate work
          await new Promise(r => setTimeout(r, 2000));
          await fsm.transition('DOWNLOAD_READY', 'Success', { tempPath: '/tmp/locked' });
          state = 'DOWNLOAD_READY';
        }

        if (state === 'DOWNLOAD_READY') {
          await fsm.transition('PROCESSING', 'Finalizing media');
          await fsm.transition('COMPLETED', 'Success');
        }
        
        return { success: true, finalState: fsm.getState() };
      }
      
      throw new Error(`unknown job name: ${job.name}`);
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await fsm.transition('FAILED', message);
      Sentry.captureException(err);
      throw err;
    }
  });
};

const downloadWorker = new Worker('downloads', processDownloadJob, { 
  connection,
  concurrency: Math.max(1, os.cpus().length - 1)
});

downloadWorker.on('completed', job => {
  console.log(`[Worker] Job ${job?.id} formally finished`);
});

downloadWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} fatally failed: ${err.message}`);
});

export default downloadWorker;
