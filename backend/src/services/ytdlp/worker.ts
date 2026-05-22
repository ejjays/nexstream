import { Worker, Job } from 'bullmq';
import { connection } from '../../utils/queue.util.js';
import os from 'node:os';
import * as Sentry from '@sentry/node';
import { MediaStateMachine } from '../../utils/fsm.util.js';

// worker logic
export const processDownloadJob = async (job: Job) => {
  return await Sentry.withIsolationScope(async (scope) => {
    scope.setTag('job_id', job.id);
    scope.setTag('job_name', job.name);
 
    // init fsm
    const fsm = new MediaStateMachine(job.id || 'unknown');
    await job.updateProgress(fsm.state);
 
    try {
      const { weight } = job.data;
      
      if (job.name === 'lock') {
        fsm.transition('METADATA_EXTRACTING', 'Acquiring resources');
        await job.updateProgress(fsm.state);
        
        console.log(`[Worker] Locking weight: ${weight || 1} (Job ${job.id})`);
        
        fsm.transition('DOWNLOADING', 'Starting secure download');
        await job.updateProgress(fsm.state);
        
        // simulate work
        await new Promise(r => setTimeout(r, 2000));
        
        fsm.transition('PROCESSING', 'Finalizing media');
        await job.updateProgress(fsm.state);
        
        fsm.transition('COMPLETED', 'Success');
        await job.updateProgress(fsm.state);
        
        return { success: true, finalState: fsm.state };
      }
      
      throw new Error(`unknown job name: ${job.name}`);
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      fsm.transition('FAILED', message);
      await job.updateProgress(fsm.state);
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

