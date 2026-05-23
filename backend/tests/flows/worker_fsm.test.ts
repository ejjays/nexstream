import { describe, it, expect, vi } from 'vitest';
import { processDownloadJob } from '../../src/services/ytdlp/worker.js';
import { Job } from 'bullmq';

describe('Worker FSM Integration', () => {
  it('should transition through all states for a valid "lock" job', async () => {
    const progressUpdates: string[] = [];

    // mock job
    const mockJob = {
      id: 'test-job-fsm',
      name: 'lock',
      data: { weight: 1 },
      progress: '',
      updateData: vi.fn(),
      updateProgress: vi.fn().mockImplementation((progress) => {
        mockJob.progress = progress;
        progressUpdates.push(progress);
      }),
    } as unknown as Job;

    const result = await processDownloadJob(mockJob);

    expect(result.success).toBe(true);
    expect(result.finalState).toBe('COMPLETED');

    // verify fsm
    expect(progressUpdates).toContain('METADATA_EXTRACTING');
    expect(progressUpdates).toContain('METADATA_READY');
    expect(progressUpdates).toContain('DOWNLOADING');
    expect(progressUpdates).toContain('DOWNLOAD_READY');
    expect(progressUpdates).toContain('PROCESSING');
    expect(progressUpdates).toContain('COMPLETED');

    // verify order
    expect(progressUpdates.indexOf('METADATA_EXTRACTING')).toBeLessThan(
      progressUpdates.indexOf('METADATA_READY')
    );
    expect(progressUpdates.indexOf('METADATA_READY')).toBeLessThan(
      progressUpdates.indexOf('DOWNLOADING')
    );
    expect(progressUpdates.indexOf('DOWNLOADING')).toBeLessThan(
      progressUpdates.indexOf('COMPLETED')
    );
  });

  it('should transition to FAILED for an unknown job', async () => {
    const progressUpdates: string[] = [];
    const mockJob = {
      id: 'test-fail-fsm',
      name: 'invalid_job_type',
      data: {},
      progress: '',
      updateData: vi.fn(),
      updateProgress: vi.fn().mockImplementation((progress) => {
        mockJob.progress = progress;
        progressUpdates.push(progress);
      }),
    } as unknown as Job;

    await expect(processDownloadJob(mockJob)).rejects.toThrow(
      /unknown job name/
    );

    expect(progressUpdates).toContain('FAILED');
    expect(progressUpdates[progressUpdates.length - 1]).toBe('FAILED');
  });
});
