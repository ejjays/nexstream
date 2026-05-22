import { Job } from 'bullmq';
import { traceContext } from '../infra/trace.util.js';

export type MediaState = 
  | 'PENDING' 
  | 'METADATA_EXTRACTING' 
  | 'METADATA_READY'
  | 'DOWNLOADING' 
  | 'DOWNLOAD_READY'
  | 'PROCESSING' 
  | 'COMPLETED' 
  | 'FAILED';

export const VALID_TRANSITIONS: Record<MediaState, MediaState[]> = {
  'PENDING': ['METADATA_EXTRACTING', 'FAILED'],
  'METADATA_EXTRACTING': ['METADATA_READY', 'FAILED'],
  'METADATA_READY': ['DOWNLOADING', 'FAILED'],
  'DOWNLOADING': ['DOWNLOAD_READY', 'FAILED'],
  'DOWNLOAD_READY': ['PROCESSING', 'FAILED'],
  'PROCESSING': ['COMPLETED', 'FAILED'],
  'COMPLETED': ['PENDING'],
  'FAILED': ['PENDING', 'METADATA_READY', 'DOWNLOAD_READY']
};

export class DistributedMediaFSM {
  private job: Job;

  constructor(job: Job) {
    this.job = job;
  }

  getState(): MediaState {
    const progress = this.job.progress;
    return (typeof progress === 'string' && progress !== '' ? progress as MediaState : 'PENDING');
  }

  async transition(to: MediaState, reason?: string, payload?: unknown): Promise<void> {
    const currentState = this.getState();

    if (!VALID_TRANSITIONS[currentState].includes(to)) {
      throw new Error(`[FSM ERROR] Job ${this.job.id}: Invalid transition ${currentState} -> ${to}`);
    }

    const traceId = traceContext.getStore()?.traceId || 'N/A';
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`[FSM|${traceId}] [${timestamp}] Job ${this.job.id}: ${currentState} -> ${to}${reason ? ` (${reason})` : ''}`);

    await this.job.updateProgress(to);
    
    if (payload) {
      await this.job.updateData({ ...this.job.data, ...payload });
    }
  }

  isTerminal(): boolean {
    const state = this.getState();
    return state === 'COMPLETED' || state === 'FAILED';
  }
}

// remove legacy FSM
