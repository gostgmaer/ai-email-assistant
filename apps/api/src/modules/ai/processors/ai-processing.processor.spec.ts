import type { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';

import { AIJobs } from '../../../infrastructure/queue';
import { AUTO_REPLY_HEADERS } from '../../email/services/compose.service';
import type { WorkflowAction } from '../../workflow/types/workflow-rule.types';
import { AiProcessingProcessor } from './ai-processing.processor';

/**
 * AiProcessingProcessor is the one place every autonomous email decision
 * is made, so these tests pin down the guarantees around it: what gets
 * auto-sent vs. held, that retries never repeat a side effect (the
 * AutomationEffect ledger), and the auto-responder loop protections.
 */
describe('AiProcessingProcessor', () => {
  const messageId = 'message-1';
  const threadId = 'thread-1';
  const accountId = 'account-1';
  const userId = 'user-1';
  const senderAddress = 'Customer@Example.com';

  const AUTO_REPLY_RULE: WorkflowAction[] = [{ type: 'AUTO_REPLY' }];

  function buildMessage(overrides: Record<string, unknown> = {}) {
    return {
      id: messageId,
      threadId,
      from: [{ address: senderAddress, name: 'Casey Customer' }],
      subject: 'Order question',
      bodyText: 'Where is my order?',
      aiProcessedAt: null,
      isAutoReply: false,
      ...overrides,
      thread: {
        id: threadId,
        subject: 'Order question',
        account: {
          id: accountId,
          userId,
          email: 'support@company.com',
          autoScheduleMeetings: false,
          autoSendEnabled: true,
          prohibitedPhrases: [],
        },
        messages: [
          {
            from: [{ address: senderAddress, name: 'Casey Customer' }],
            bodyText: 'Where is my order?',
          },
        ],
        ...((overrides.thread as object) ?? {}),
      },
    };
  }

  /** In-memory AutomationEffect table with the real unique constraint. */
  function buildLedger() {
    const rows = new Map<string, Record<string, unknown>>();
    type Where = { messageId_kind: { messageId: string; kind: string } };
    const key = (where: Where) =>
      `${where.messageId_kind.messageId}:${where.messageId_kind.kind}`;

    return {
      rows,
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const k = `${data.messageId as string}:${data.kind as string}`;
        if (rows.has(k)) {
          return Promise.reject(
            Object.assign(new Error('Unique'), { code: 'P2002' }),
          );
        }
        const row = { status: 'PENDING', createdAt: new Date(), ...data };
        rows.set(k, row);
        return Promise.resolve(row);
      }),
      findUnique: jest.fn(({ where }: { where: Where }) =>
        Promise.resolve(rows.get(key(where)) ?? null),
      ),
      update: jest.fn(
        ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
          const row = { ...rows.get(key(where)), ...data };
          rows.set(key(where), row);
          return Promise.resolve(row);
        },
      ),
      delete: jest.fn(({ where }: { where: Where }) => {
        rows.delete(key(where));
        return Promise.resolve({});
      }),
      count: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          [...rows.values()].filter(
            (row) =>
              row.kind === where.kind &&
              (where.threadId === undefined ||
                row.threadId === where.threadId) &&
              (where.recipient === undefined ||
                row.recipient === where.recipient),
          ).length,
        ),
      ),
    };
  }

  function buildDeps(
    options: {
      message?: ReturnType<typeof buildMessage>;
      rule?: WorkflowAction[] | null;
      env?: Record<string, string>;
      validationConfidence?: number;
      priority?: string;
    } = {},
  ) {
    const message = options.message ?? buildMessage();
    const ledger = buildLedger();

    const prisma = {
      emailMessage: {
        findUnique: jest.fn().mockResolvedValue(message),
        update: jest.fn().mockResolvedValue({}),
      },
      emailThread: { update: jest.fn().mockResolvedValue({}) },
      automationEffect: ledger,
    };

    const aiClientService = {
      classify: jest.fn().mockResolvedValue({
        classification: {
          category: 'Support',
          priority: options.priority ?? 'Normal',
          sentiment: 'Neutral',
          spam: false,
          language: 'en',
          containsPii: false,
          piiTypes: [],
        },
      }),
      contactMemory: jest.fn().mockResolvedValue({
        facts: { role: null, company: null, summary: '', commitments: [] },
        embedding: [0.1],
      }),
      generateReply: jest.fn().mockResolvedValue({
        reply: 'Hi Casey,\n\nIt ships <b>today</b>.',
        provider: 'test',
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }),
      validateReply: jest.fn().mockResolvedValue({
        validation: {
          addressesThread: true,
          concerns: [],
          unsupportedClaims: [],
          grammarIssues: [],
          toneAppropriate: true,
          toneNote: '',
          confidence: options.validationConfidence ?? 90,
        },
      }),
      summarize: jest.fn(),
      extract: jest.fn().mockResolvedValue({ extraction: {} }),
    };

    const contactMemoryService = {
      upsertMemory: jest.fn().mockResolvedValue(undefined),
      searchSimilar: jest.fn().mockResolvedValue([]),
    };
    const composeService = {
      reply: jest.fn().mockResolvedValue({ providerMessageId: 'sent-1' }),
      saveDraftReply: jest.fn().mockResolvedValue({ id: 'draft-1' }),
    };
    const tasksService = {
      createFromExtraction: jest.fn().mockResolvedValue([]),
    };
    const documentsService = { search: jest.fn().mockResolvedValue([]) };
    const meetingSchedulingService = { autoSchedule: jest.fn() };
    const calendarContextService = {
      buildAvailabilityContext: jest.fn().mockResolvedValue(null),
    };
    const workflowRuleService = {
      evaluate: jest
        .fn()
        .mockResolvedValue(options.rule === undefined ? null : options.rule),
      executeActions: jest.fn((actions: WorkflowAction[]) =>
        Promise.resolve({
          autoReply: actions.some((a) => a.type === 'AUTO_REPLY'),
          approvalChainApproverUserIds: actions.find(
            (a) => a.type === 'REQUIRE_APPROVAL_CHAIN',
          )
            ? ['approver-1']
            : undefined,
        }),
      ),
    };
    const agentService = { getEnabledSystemPrompt: jest.fn() };
    const contactService = {
      touchLastContacted: jest.fn().mockResolvedValue(undefined),
      findByEmail: jest.fn().mockResolvedValue(null),
    };
    const notificationService = { create: jest.fn().mockResolvedValue({}) };
    const approvalChainService = { create: jest.fn().mockResolvedValue({}) };
    const configService = {
      get: jest.fn((name: string) => options.env?.[name]),
    } as unknown as ConfigService;

    const processor = new AiProcessingProcessor(
      prisma as never,
      aiClientService as never,
      contactMemoryService as never,
      composeService as never,
      tasksService as never,
      documentsService as never,
      meetingSchedulingService as never,
      calendarContextService as never,
      workflowRuleService as never,
      agentService as never,
      contactService as never,
      notificationService as never,
      approvalChainService as never,
      configService,
    );

    const run = () =>
      processor.process({
        name: AIJobs.ProcessMessage,
        data: { messageId },
      } as Job<{ messageId: string }>);

    return {
      run,
      ledger,
      prisma,
      aiClientService,
      composeService,
      tasksService,
      workflowRuleService,
      notificationService,
      approvalChainService,
    };
  }

  describe('send vs. draft', () => {
    it('drafts for review when no rule matches', async () => {
      const deps = buildDeps();

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
      expect(deps.composeService.saveDraftReply).toHaveBeenCalledTimes(1);
      expect(deps.ledger.rows.get(`${messageId}:DRAFT`)).toMatchObject({
        status: 'DONE',
      });
      expect(deps.prisma.emailMessage.update).toHaveBeenLastCalledWith({
        where: { id: messageId },
        data: { aiProcessedAt: expect.any(Date) as Date },
      });
    });

    it('auto-sends with escaped HTML and loop-prevention headers when an AUTO_REPLY rule matches and every rail passes', async () => {
      const deps = buildDeps({ rule: AUTO_REPLY_RULE });

      await deps.run();

      expect(deps.composeService.reply).toHaveBeenCalledWith(
        userId,
        {
          messageId,
          bodyHtml: '<p>Hi Casey,</p><p>It ships &lt;b&gt;today&lt;/b&gt;.</p>',
          bodyText: 'Hi Casey,\n\nIt ships <b>today</b>.',
        },
        expect.objectContaining({ provider: 'test' }),
        { headers: AUTO_REPLY_HEADERS },
      );
      expect(deps.composeService.saveDraftReply).not.toHaveBeenCalled();
      expect(deps.ledger.rows.get(`${messageId}:SEND`)).toMatchObject({
        status: 'DONE',
        providerMessageId: 'sent-1',
        recipient: senderAddress.toLowerCase(),
      });
      expect(deps.notificationService.create).toHaveBeenCalledWith(
        userId,
        'Auto-replied to an email',
        expect.any(String),
        expect.anything(),
      );
    });

    it('never processes spam past classification', async () => {
      const deps = buildDeps({ rule: AUTO_REPLY_RULE });
      deps.aiClientService.classify.mockResolvedValue({
        classification: {
          category: 'Spam',
          priority: 'Low',
          sentiment: 'Neutral',
          spam: true,
          language: 'en',
          containsPii: false,
          piiTypes: [],
        },
      });

      await deps.run();

      expect(deps.aiClientService.generateReply).not.toHaveBeenCalled();
      expect(deps.workflowRuleService.executeActions).not.toHaveBeenCalled();
    });

    it('holds urgent mail for review even with an AUTO_REPLY rule', async () => {
      const deps = buildDeps({ rule: AUTO_REPLY_RULE, priority: 'Urgent' });

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
      expect(deps.composeService.saveDraftReply).toHaveBeenCalledTimes(1);
    });

    it('holds low-confidence replies for review', async () => {
      const deps = buildDeps({
        rule: AUTO_REPLY_RULE,
        validationConfidence: 40,
      });

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
      expect(deps.composeService.saveDraftReply).toHaveBeenCalledTimes(1);
    });

    it('creates an approval chain on the draft for REQUIRE_APPROVAL_CHAIN rules', async () => {
      const deps = buildDeps({
        rule: [
          { type: 'REQUIRE_APPROVAL_CHAIN', approverUserIds: ['approver-1'] },
        ],
      });

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
      expect(deps.approvalChainService.create).toHaveBeenCalledWith(
        accountId,
        'draft-1',
        ['approver-1'],
      );
    });

    it('runs routing actions even when reply generation fails', async () => {
      const deps = buildDeps({ rule: AUTO_REPLY_RULE });
      deps.aiClientService.generateReply.mockRejectedValue(
        new Error('LLM down'),
      );

      await expect(deps.run()).rejects.toThrow('LLM down');

      expect(deps.workflowRuleService.executeActions).toHaveBeenCalledTimes(1);
    });
  });

  describe('auto-send blockers (kill switches and loop protection)', () => {
    it('holds as a draft when AUTO_SEND_ENABLED=false, without paying for validation', async () => {
      const deps = buildDeps({
        rule: AUTO_REPLY_RULE,
        env: { AUTO_SEND_ENABLED: 'false' },
      });

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
      expect(deps.aiClientService.validateReply).not.toHaveBeenCalled();
      expect(deps.composeService.saveDraftReply).toHaveBeenCalledTimes(1);
    });

    it('holds as a draft when the account has auto-send disabled', async () => {
      const message = buildMessage();
      message.thread.account.autoSendEnabled = false;
      const deps = buildDeps({ rule: AUTO_REPLY_RULE, message });

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
      expect(deps.composeService.saveDraftReply).toHaveBeenCalledTimes(1);
    });

    it('never auto-sends in response to an automatic reply (out-of-office, ticket bot)', async () => {
      const deps = buildDeps({
        rule: AUTO_REPLY_RULE,
        message: buildMessage({ isAutoReply: true }),
      });

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
      expect(deps.composeService.saveDraftReply).toHaveBeenCalledTimes(1);
    });

    it('holds as a draft once the thread already got an auto-reply in the last 24h', async () => {
      const deps = buildDeps({ rule: AUTO_REPLY_RULE });
      deps.ledger.rows.set('earlier-message:SEND', {
        messageId: 'earlier-message',
        threadId,
        accountId,
        kind: 'SEND',
        status: 'DONE',
        recipient: senderAddress.toLowerCase(),
      });

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
      expect(deps.composeService.saveDraftReply).toHaveBeenCalledTimes(1);
    });

    it('holds as a draft once the recipient already got 3 auto-replies in the last 24h', async () => {
      const deps = buildDeps({ rule: AUTO_REPLY_RULE });
      for (let i = 0; i < 3; i++) {
        deps.ledger.rows.set(`other-${i}:SEND`, {
          messageId: `other-${i}`,
          threadId: `other-thread-${i}`,
          accountId,
          kind: 'SEND',
          status: 'DONE',
          recipient: senderAddress.toLowerCase(),
        });
      }

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
    });
  });

  describe('idempotency across retries', () => {
    it('a retry after a failure that followed the send does not send, notify, extract or run rule actions again', async () => {
      const deps = buildDeps({ rule: AUTO_REPLY_RULE });
      // First attempt fails at the very end (marking the message processed).
      deps.prisma.emailMessage.update.mockRejectedValueOnce(
        new Error('DB blip'),
      );

      await expect(deps.run()).rejects.toThrow('DB blip');
      await deps.run();

      expect(deps.composeService.reply).toHaveBeenCalledTimes(1);
      expect(deps.workflowRuleService.executeActions).toHaveBeenCalledTimes(1);
      expect(deps.tasksService.createFromExtraction).toHaveBeenCalledTimes(1);
      expect(deps.aiClientService.generateReply).toHaveBeenCalledTimes(1);
      expect(deps.notificationService.create).toHaveBeenCalledTimes(1);
      expect(deps.composeService.saveDraftReply).not.toHaveBeenCalled();
    });

    it('a retry after a failure that followed drafting does not create a second draft', async () => {
      const deps = buildDeps();
      deps.prisma.emailMessage.update.mockRejectedValueOnce(
        new Error('DB blip'),
      );

      await expect(deps.run()).rejects.toThrow('DB blip');
      await deps.run();

      expect(deps.composeService.saveDraftReply).toHaveBeenCalledTimes(1);
    });

    it('releases the send claim when the provider rejects the send, so the retry can send', async () => {
      const deps = buildDeps({ rule: AUTO_REPLY_RULE });
      deps.composeService.reply.mockRejectedValueOnce(new Error('Gmail 500'));

      await expect(deps.run()).rejects.toThrow('Gmail 500');
      await deps.run();

      expect(deps.composeService.reply).toHaveBeenCalledTimes(2);
      expect(deps.ledger.rows.get(`${messageId}:SEND`)).toMatchObject({
        status: 'DONE',
      });
    });

    it('holds as a draft and warns the user when an earlier send attempt has an unknown outcome', async () => {
      const deps = buildDeps({ rule: AUTO_REPLY_RULE });
      deps.ledger.rows.set(`${messageId}:SEND`, {
        messageId,
        threadId,
        accountId,
        kind: 'SEND',
        status: 'PENDING',
      });

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
      expect(deps.composeService.saveDraftReply).toHaveBeenCalledTimes(1);
      expect(deps.notificationService.create).toHaveBeenCalledWith(
        userId,
        'Check whether an auto-reply was sent',
        expect.any(String),
        expect.objectContaining({ draftId: 'draft-1' }),
      );
    });

    it('skips messages already marked processed', async () => {
      const deps = buildDeps({
        message: buildMessage({ aiProcessedAt: new Date() }),
      });

      await deps.run();

      expect(deps.aiClientService.classify).not.toHaveBeenCalled();
    });
  });
});
