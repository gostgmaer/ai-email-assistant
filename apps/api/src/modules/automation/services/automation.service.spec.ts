import type { ConfigService } from '@nestjs/config';

import { AUTO_REPLY_HEADERS } from '../../email/services/compose.service';
import { AutomationService } from './automation.service';

describe('AutomationService', () => {
  const draftId = 'draft-1';
  const originalId = 'message-1';
  const userId = 'user-1';

  function buildDeps(
    options: {
      draft?: Record<string, unknown> | null;
      claimCount?: number;
      env?: Record<string, string>;
      autoSendEnabled?: boolean;
    } = {},
  ) {
    const draft =
      options.draft === undefined
        ? {
            id: draftId,
            scheduledSendAt: new Date(Date.now() - 1000),
            inReplyToMessageId: originalId,
            subject: 'Re: Order question',
            thread: {
              account: {
                id: 'account-1',
                userId,
                email: 'support@company.com',
                autoSendEnabled: options.autoSendEnabled ?? true,
              },
            },
          }
        : options.draft;

    const prisma = {
      emailMessage: {
        findUnique: jest.fn().mockResolvedValue(draft),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      automationEffect: {
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: options.claimCount ?? 1 }),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      ruleExecution: {
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const composeService = {
      sendDraft: jest.fn().mockResolvedValue({ providerMessageId: 'sent-1' }),
    };
    const notificationService = { create: jest.fn().mockResolvedValue({}) };
    const emailAccountService = {
      getOwnedAccountOrThrow: jest.fn().mockResolvedValue({}),
    };
    const queueService = { enqueueScheduledSend: jest.fn() };
    const configService = {
      get: jest.fn((name: string) => options.env?.[name]),
    } as unknown as ConfigService;

    const service = new AutomationService(
      prisma as never,
      composeService as never,
      notificationService as never,
      emailAccountService as never,
      queueService as never,
      configService,
    );

    return {
      service,
      prisma,
      composeService,
      notificationService,
      queueService,
    };
  }

  describe('sendScheduledReply', () => {
    it('claims the send, sends the draft as an automatic reply and records it', async () => {
      const deps = buildDeps();

      await deps.service.sendScheduledReply(draftId);

      expect(deps.prisma.automationEffect.updateMany).toHaveBeenCalledWith({
        where: { messageId: originalId, kind: 'SEND', status: 'SCHEDULED' },
        data: { status: 'PENDING' },
      });
      expect(deps.composeService.sendDraft).toHaveBeenCalledWith(
        userId,
        draftId,
        { headers: AUTO_REPLY_HEADERS, fromSchedule: true },
      );
      expect(deps.prisma.automationEffect.update).toHaveBeenCalledWith({
        where: { messageId_kind: { messageId: originalId, kind: 'SEND' } },
        data: { status: 'DONE', providerMessageId: 'sent-1' },
      });
    });

    it('does nothing when the send was cancelled first', async () => {
      const deps = buildDeps({ claimCount: 0 });

      await deps.service.sendScheduledReply(draftId);

      expect(deps.composeService.sendDraft).not.toHaveBeenCalled();
    });

    it('does nothing for a draft that was deleted or already sent', async () => {
      const deps = buildDeps({ draft: null });

      await deps.service.sendScheduledReply(draftId);

      expect(deps.prisma.automationEffect.updateMany).not.toHaveBeenCalled();
    });

    it('holds the reply when auto-send was switched off while it waited', async () => {
      const deps = buildDeps({ autoSendEnabled: false });

      await deps.service.sendScheduledReply(draftId);

      expect(deps.composeService.sendDraft).not.toHaveBeenCalled();
      expect(deps.prisma.automationEffect.updateMany).toHaveBeenCalledWith({
        where: { messageId: originalId, kind: 'SEND', status: 'SCHEDULED' },
        data: { status: 'CANCELLED' },
      });
      expect(deps.notificationService.create).toHaveBeenCalledWith(
        userId,
        'Scheduled auto-reply held',
        expect.stringContaining('turned off'),
        expect.anything(),
      );
    });

    it('puts the claim back when the provider rejects the send, so the retry can try again', async () => {
      const deps = buildDeps();
      deps.composeService.sendDraft.mockRejectedValue(new Error('SMTP down'));

      await expect(deps.service.sendScheduledReply(draftId)).rejects.toThrow(
        'SMTP down',
      );

      expect(deps.prisma.automationEffect.updateMany).toHaveBeenLastCalledWith({
        where: { messageId: originalId, kind: 'SEND', status: 'PENDING' },
        data: { status: 'SCHEDULED' },
      });
    });

    it('waits again if the job fired before the scheduled time', async () => {
      const later = new Date(Date.now() + 60_000);
      const deps = buildDeps({
        draft: {
          id: draftId,
          scheduledSendAt: later,
          inReplyToMessageId: originalId,
          subject: 'Re: x',
          thread: { account: { userId, autoSendEnabled: true } },
        },
      });

      await deps.service.sendScheduledReply(draftId);

      expect(deps.queueService.enqueueScheduledSend).toHaveBeenCalledWith(
        draftId,
        later,
      );
      expect(deps.composeService.sendDraft).not.toHaveBeenCalled();
    });
  });

  it('removes rule history older than 90 days', async () => {
    const deps = buildDeps();
    const before = Date.now();

    expect(await deps.service.cleanupRuleExecutions()).toBe(3);

    const [[{ where }]] = deps.prisma.ruleExecution.deleteMany.mock.calls as [
      [{ where: { createdAt: { lt: Date } } }],
    ];
    expect(before - where.createdAt.lt.getTime()).toBeGreaterThanOrEqual(
      90 * 24 * 60 * 60 * 1000,
    );
  });

  it('merges sends and rule runs into one newest-first audit log', async () => {
    const deps = buildDeps();
    deps.prisma.automationEffect.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-10-20T10:00:00Z'),
        messageId: 'm1',
        threadId: 't1',
        status: 'DONE',
        recipient: 'a@example.com',
        details: { confidence: 90 },
        message: { subject: 'First' },
      },
    ]);
    deps.prisma.ruleExecution.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-10-20T11:00:00Z'),
        messageId: 'm2',
        ruleId: 'r1',
        ruleName: 'Label invoices',
        results: [
          { type: 'ADD_LABEL', status: 'done' },
          { type: 'WEBHOOK', status: 'failed' },
        ],
        durationMs: 120,
        message: { subject: 'Second', threadId: 't2' },
      },
    ]);

    const log = await deps.service.getAuditLog(userId, 'account-1');

    expect(log.map((entry) => [entry.kind, entry.status])).toEqual([
      ['RULE', 'failed'],
      ['SEND', 'DONE'],
    ]);
  });

  describe('snooze wake-up', () => {
    const until = '2026-10-21T09:00:00.000Z';

    function withThread(snoozedUntil: Date | null) {
      const deps = buildDeps();
      Object.assign(deps.prisma, {
        emailThread: {
          findUnique: jest.fn().mockResolvedValue({
            subject: 'Contract',
            snoozedUntil,
            assignedToUserId: 'assignee-1',
            account: { userId },
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      });
      return deps as typeof deps & {
        prisma: { emailThread: { updateMany: jest.Mock } };
      };
    }

    it('unsnoozes the thread and tells the assignee', async () => {
      const deps = withThread(new Date(until));

      await deps.service.wakeSnoozedThread('thread-1', until);

      expect(deps.prisma.emailThread.updateMany).toHaveBeenCalledWith({
        where: { id: 'thread-1', snoozedUntil: new Date(until) },
        data: { snoozedUntil: null },
      });
      expect(deps.notificationService.create).toHaveBeenCalledWith(
        'assignee-1',
        'A snoozed conversation is back',
        expect.any(String),
        { threadId: 'thread-1' },
        'SNOOZE_WAKE',
      );
    });

    it('ignores a stale job after the thread was re-snoozed', async () => {
      const deps = withThread(new Date('2026-10-25T09:00:00Z'));

      await deps.service.wakeSnoozedThread('thread-1', until);

      expect(deps.prisma.emailThread.updateMany).not.toHaveBeenCalled();
      expect(deps.notificationService.create).not.toHaveBeenCalled();
    });
  });

  describe('follow-up reminders', () => {
    it('creates a FOLLOW_UP task only where the last message is still the user’s own', async () => {
      const deps = buildDeps();
      const due = new Date('2026-10-20T00:00:00Z');
      const thread = (id: string, lastMessageFromSelf: boolean) => ({
        id,
        subject: `Subject ${id}`,
        followUpAt: due,
        lastMessageFromSelf,
        assignedToUserId: null,
        account: { userId },
      });
      const taskCreate = jest.fn();
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      Object.assign(deps.prisma, {
        emailThread: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              thread('waiting', true),
              thread('answered', false),
            ]),
          updateMany,
        },
        task: { create: taskCreate },
      });

      const reminded = await deps.service.runFollowUpScan(new Date());

      expect(reminded).toBe(1);
      expect(updateMany).toHaveBeenCalledTimes(2);
      expect(taskCreate).toHaveBeenCalledWith({
        data: {
          userId,
          threadId: 'waiting',
          type: 'FOLLOW_UP',
          description: 'No reply yet: Subject waiting',
        },
      });
      expect(deps.notificationService.create).toHaveBeenCalledWith(
        userId,
        'No reply yet',
        expect.any(String),
        { threadId: 'waiting' },
        'FOLLOW_UP',
      );
    });
  });
});
