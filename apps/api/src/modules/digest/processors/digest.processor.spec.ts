import type { Job } from 'bullmq';

import { DigestJobs } from '../../../infrastructure/queue';
import { DigestProcessor } from './digest.processor';

describe('DigestProcessor', () => {
  it('sends the digest only to users whose local time is their digest hour', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-21T06:00:00Z'));
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          // 08:00 in Berlin (UTC+2) — due.
          { id: 'berlin', timezone: 'Europe/Berlin', digestHour: 8 },
          // 06:00 UTC — not their hour.
          { id: 'utc', timezone: 'UTC', digestHour: 8 },
          // 02:00 in New York — due.
          { id: 'ny', timezone: 'America/New_York', digestHour: 2 },
        ]),
      },
    };
    const queueService = { enqueueDigestForUser: jest.fn() };
    const processor = new DigestProcessor(
      prisma as never,
      queueService as never,
      {} as never,
    );

    await processor.process({
      name: DigestJobs.BuildAll,
      data: {},
    } as Job<{ userId?: string }>);

    expect(queueService.enqueueDigestForUser.mock.calls).toEqual([
      ['berlin'],
      ['ny'],
    ]);
    jest.useRealTimers();
  });
});
