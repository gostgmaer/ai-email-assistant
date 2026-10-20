import { ConflictException } from '@nestjs/common';

import { InboxService } from './inbox.service';

describe('InboxService', () => {
  function buildDeps() {
    const prisma = {
      emailThread: { findMany: jest.fn().mockResolvedValue([]) },
      emailMessage: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const emailAccountService = {
      getAccessibleAccountOrThrow: jest.fn().mockResolvedValue({}),
    };
    const queueService = { enqueueAiProcessing: jest.fn() };

    const service = new InboxService(
      prisma as never,
      {} as never,
      emailAccountService as never,
      queueService as never,
    );

    return { service, prisma, queueService };
  }

  describe('getFollowUpCandidates', () => {
    it('queries threads whose last message is the user’s own, newest first, in SQL', async () => {
      const { service, prisma } = buildDeps();

      await service.getFollowUpCandidates('user-1', 3);

      const args = prisma.emailThread.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
        orderBy: unknown;
      };
      expect(args.where).toMatchObject({
        lastMessageFromSelf: true,
        folder: { type: { not: 'DRAFTS' } },
      });
      expect(args.orderBy).toEqual({ lastMessageAt: 'desc' });
    });

    it('maps candidates without any in-memory sender filtering', async () => {
      const { service, prisma } = buildDeps();
      const lastMessageAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      prisma.emailThread.findMany.mockResolvedValue([
        {
          id: 'thread-1',
          subject: 'Proposal',
          lastMessageAt,
          account: { id: 'a', provider: 'GOOGLE', email: 'me@acme.io' },
          tasks: [],
        },
      ]);

      const [candidate] = await service.getFollowUpCandidates('user-1', 3);

      expect(candidate).toMatchObject({
        threadId: 'thread-1',
        daysSinceLastMessage: 5,
      });
    });
  });

  describe('retryAiProcessing', () => {
    const message = (aiProcessedAt: Date | null) => ({
      id: 'message-1',
      aiProcessedAt,
      thread: { account: { id: 'account-1' } },
    });

    it('clears the failure and re-queues the message', async () => {
      const { service, prisma, queueService } = buildDeps();
      prisma.emailMessage.findUnique.mockResolvedValue(message(null));

      await service.retryAiProcessing('user-1', 'message-1');

      expect(prisma.emailMessage.update).toHaveBeenCalledWith({
        where: { id: 'message-1' },
        data: { aiFailedAt: null, aiError: null },
      });
      expect(queueService.enqueueAiProcessing).toHaveBeenCalledWith(
        'message-1',
        { retry: true },
      );
    });

    it('refuses a message that was already processed', async () => {
      const { service, prisma, queueService } = buildDeps();
      prisma.emailMessage.findUnique.mockResolvedValue(message(new Date()));

      await expect(
        service.retryAiProcessing('user-1', 'message-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(queueService.enqueueAiProcessing).not.toHaveBeenCalled();
    });
  });
});
