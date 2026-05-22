import { describe, it, expect } from 'vitest';
import { DistributedMediaFSM } from '../../src/utils/media/fsm.util.js';
import { Job } from 'bullmq';

describe('DistributedMediaFSM', () => {
  const createMockJob = (id: string, initialProgress: unknown = ''): Job => {
    const job = {
      id,
      progress: initialProgress,
      data: {},
      updateProgress: (p: unknown) => { job.progress = p; },
      updateData: (d: unknown) => { job.data = d; },
    } as unknown as Job;
    return job;
  };

  it('should initialize in PENDING state', () => {
    const job = createMockJob('test-123');
    const fsm = new DistributedMediaFSM(job);
    expect(fsm.getState()).toBe('PENDING');
  });

  it('should read state from Job progress', () => {
    const job = createMockJob('test-123', 'DOWNLOADING');
    const fsm = new DistributedMediaFSM(job);
    expect(fsm.getState()).toBe('DOWNLOADING');
  });

  it('should update Job progress on valid transition', async () => {
    const job = createMockJob('test-123', 'PENDING');
    const fsm = new DistributedMediaFSM(job);
    
    await fsm.transition('METADATA_EXTRACTING');
    expect(fsm.getState()).toBe('METADATA_EXTRACTING');
    expect(job.progress).toBe('METADATA_EXTRACTING');
  });

  it('should fail on invalid transition', async () => {
    const job = createMockJob('test-123', 'PENDING');
    const fsm = new DistributedMediaFSM(job);
    
    await expect(fsm.transition('DOWNLOADING')).rejects.toThrow(/Invalid transition/);
  });

  it('should allow checkpoint data persistence', async () => {
    const job = createMockJob('test-123', 'METADATA_EXTRACTING');
    const fsm = new DistributedMediaFSM(job);
    
    await fsm.transition('METADATA_READY', 'Success', { meta: 'data' });
    expect(job.data).toEqual({ meta: 'data' });
  });
});
