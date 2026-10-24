import { ConflictException } from '@nestjs/common';

import { InboxService } from './inbox.service';

describe('InboxService', () => {
  function buildDeps() {
    const prisma = {
      emailThread: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      emailMessage: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const emailAccountService = {
      getAccessibleAccountOrThrow: jest.fn().mockResolvedValue({}),
    };
    const queueService = {
      enqueueAiProcessing: jest.fn(),
      enqueueSnoozeWake: jest.fn(),
      cancelSnoozeWake: jest.fn(),
    };

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

      const [[args]] = prisma.emailThread.findMany.mock.calls as [
        [{ where: Record<string, unknown>; orderBy: unknown }],
      ];
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

  describe('listThreads folder filter', () => {
    const folderOf = (prisma: ReturnType<typeof buildDeps>['prisma']) =>
      (
        prisma.emailThread.findMany.mock.calls[0] as [
          { where: { folder: unknown } },
        ]
      )[0].where.folder;

    it('defaults to the inbox', async () => {
      const { service, prisma } = buildDeps();
      await service.listThreads('user-1', {});
      expect(folderOf(prisma)).toEqual({ type: 'INBOX' });
    });

    it('lists snoozed threads from every folder when no folder is chosen', async () => {
      const { service, prisma } = buildDeps();
      await service.listThreads('user-1', { snoozed: true });
      expect(folderOf(prisma)).toEqual({ type: { not: 'DRAFTS' } });
    });

    it('keeps an explicitly chosen folder', async () => {
      const { service, prisma } = buildDeps();
      await service.listThreads('user-1', {
        snoozed: true,
        folderType: 'SENT',
      });
      expect(folderOf(prisma)).toEqual({ type: 'SENT' });
    });
  });

  describe('snooze', () => {
    it('schedules a wake-up for the snooze time, and cancels it on unsnooze', async () => {
      const { service, queueService } = buildDeps();
      const until = new Date('2026-10-22T09:00:00Z');

      await service.snooze('user-1', 'thread-1', until);
      expect(queueService.enqueueSnoozeWake).toHaveBeenCalledWith(
        'thread-1',
        until,
      );

      await service.unsnooze('user-1', 'thread-1');
      expect(queueService.cancelSnoozeWake).toHaveBeenCalledWith('thread-1');
    });
  });

  describe('saveSummary', () => {
    it('saves the summary only on a thread the user is a member of', async () => {
      const { service, prisma } = buildDeps();

      await service.saveSummary('user-1', 'thread-1', 'Short summary', [
        'Point A',
      ]);

      expect(prisma.emailThread.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'thread-1',
          account: { members: { some: { userId: 'user-1' } } },
        },
        data: { summary: 'Short summary', summaryKeyPoints: ['Point A'] },
      });
    });

    it("reports someone else's thread as not found", async () => {
      const { service, prisma } = buildDeps();
      prisma.emailThread.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.saveSummary('user-1', 'thread-1', 'x', []),
      ).rejects.toThrow('Thread not found');
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
