import type { Queue } from 'bullmq';

import { QueueService } from './queue.service';

describe('QueueService', () => {
  function buildService(existingJob?: { state: string }) {
    const job = existingJob
      ? {
          getState: jest.fn().mockResolvedValue(existingJob.state),
          remove: jest.fn(),
        }
      : undefined;
    const aiQueue = {
      add: jest.fn(),
      getJob: jest.fn().mockResolvedValue(job),
    };
    const emailSyncQueue = { add: jest.fn() };
    const other = {} as Queue;

    const service = new QueueService(
      emailSyncQueue as unknown as Queue,
      aiQueue as unknown as Queue,
      other,
      other,
      other,
      other,
    );

    return { service, aiQueue, emailSyncQueue, job };
  }

  describe('enqueueAiProcessing with retry', () => {
    it.each(['failed', 'completed'])(
      'removes a %s job first, so the re-add is not silently ignored',
      async (state) => {
        const { service, aiQueue, job } = buildService({ state });

        await service.enqueueAiProcessing('message-1', { retry: true });

        expect(job.remove).toHaveBeenCalled();
        expect(aiQueue.add).toHaveBeenCalledWith(
          'process-message',
          { messageId: 'message-1' },
          { jobId: 'process-message-message-1' },
        );
      },
    );

    it('leaves a job that is still waiting or running alone', async () => {
      const { service, job } = buildService({ state: 'active' });

      await service.enqueueAiProcessing('message-1', { retry: true });

      expect(job.remove).not.toHaveBeenCalled();
    });
  });

  it('gives incremental syncs one id per account, so overlapping syncs collapse into one', async () => {
    const { service, emailSyncQueue } = buildService();

    await service.enqueueIncrementalSync('account-1');
    await service.enqueueIncrementalSync('account-1');

    const jobIds = emailSyncQueue.add.mock.calls.map(
      (call) => (call[2] as { jobId: string }).jobId,
    );
    expect(new Set(jobIds).size).toBe(1);
    expect(emailSyncQueue.add.mock.calls[0][2]).toMatchObject({
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    });
  });
});
