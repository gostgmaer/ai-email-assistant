import type { PrismaService } from '../../../database';
import type { ExtractionResult } from '../../ai/services/ai-client.service';
import { TasksService } from './tasks.service';

function buildExtraction(
  overrides: Partial<ExtractionResult>,
): ExtractionResult {
  return {
    people: [],
    emails: [],
    phones: [],
    companies: [],
    dates: [],
    urls: [],
    tasks: [],
    meetingRequests: [],
    ...overrides,
  };
}

describe('TasksService.createFromExtraction', () => {
  const userId = 'user-1';
  const messageId = 'msg-1';
  const threadId = 'thread-1';

  function buildPrismaMock() {
    let nextId = 0;
    const create = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      nextId += 1;
      return Promise.resolve({ id: `task-${nextId}`, ...data });
    });

    return {
      task: { create },
      // $transaction(array) — the real Prisma client fires each promise and
      // resolves once every one settles; Promise.all is an accurate stand-in
      // since our `create` mock never actually needs interactive-transaction
      // semantics.
      $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) =>
        Promise.all(ops),
      ),
    };
  }

  it('returns [] without touching the database when extraction has nothing usable', async () => {
    const prisma = buildPrismaMock();
    const service = new TasksService(prisma as unknown as PrismaService);

    const result = await service.createFromExtraction(
      userId,
      messageId,
      threadId,
      buildExtraction({ tasks: ['   '] }),
    );

    expect(result).toEqual([]);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('creates one row per task/meetingRequest and returns the created rows (not just a count)', async () => {
    const prisma = buildPrismaMock();
    const service = new TasksService(prisma as unknown as PrismaService);

    const result = await service.createFromExtraction(
      userId,
      messageId,
      threadId,
      buildExtraction({
        tasks: ['Send the invoice'],
        meetingRequests: ['Can we sync next week?'],
      }),
    );

    expect(prisma.task.create).toHaveBeenCalledTimes(2);
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: {
        userId,
        emailMessageId: messageId,
        threadId,
        type: 'ACTION_ITEM',
        description: 'Send the invoice',
      },
    });
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: {
        userId,
        emailMessageId: messageId,
        threadId,
        type: 'MEETING_REQUEST',
        description: 'Can we sync next week?',
      },
    });

    // The auto-schedule hook (AiProcessingProcessor.extractTasks) depends on
    // getting real task IDs back to act on immediately — this is the
    // behavior that motivated switching off createMany().
    expect(result).toHaveLength(2);
    expect(result.every((task) => typeof task.id === 'string')).toBe(true);
  });

  it('swallows a persistence failure and returns [] rather than throwing', async () => {
    const prisma = buildPrismaMock();
    prisma.$transaction.mockRejectedValueOnce(new Error('db down'));
    const service = new TasksService(prisma as unknown as PrismaService);

    const result = await service.createFromExtraction(
      userId,
      messageId,
      threadId,
      buildExtraction({ tasks: ['Send the invoice'] }),
    );

    expect(result).toEqual([]);
  });
});
