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
  const RECEIVED_AT = new Date('2026-10-20T10:00:00Z');

  function buildMessage(overrides: Record<string, unknown> = {}) {
    return {
      id: messageId,
      threadId,
      from: [{ address: senderAddress, name: 'Casey Customer' }],
      subject: 'Order question',
      bodyText: 'Where is my order?',
      to: [{ address: 'support@company.com' }],
      cc: [],
      receivedAt: RECEIVED_AT,
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
          displayName: null,
          autoScheduleMeetings: false,
          autoSendEnabled: true,
          prohibitedPhrases: [],
          aliases: [],
          autoSendHourlyCap: 10,
          autoSendDailyCap: 50,
          autoSendConfidenceThreshold: 70,
          quietHoursStart: null,
          quietHoursEnd: null,
          undoSendSeconds: 0,
          businessHoursStart: '09:00',
          businessHoursEnd: '17:00',
          businessDays: [1, 2, 3, 4, 5],
          signatureText: null,
          signatureHtml: null,
          user: {
            timezone: 'UTC',
            displayName: 'Support Team',
            jobTitle: null,
            companyName: null,
          },
          ...((overrides.account as object) ?? {}),
        },
        messages: [
          {
            id: messageId,
            from: [{ address: senderAddress, name: 'Casey Customer' }],
            to: [{ address: 'support@company.com' }],
            cc: [],
            bodyText: 'Where is my order?',
            receivedAt: RECEIVED_AT,
            isAutoReply: false,
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
                row.recipient === where.recipient) &&
              (where.messageId === undefined ||
                row.messageId !== (where.messageId as { not: string }).not) &&
              (where.status === undefined ||
                row.status !== (where.status as { not: string }).not),
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
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      emailThread: { update: jest.fn().mockResolvedValue({}) },
      automationEffect: ledger,
      notification: { count: jest.fn().mockResolvedValue(0) },
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
          needsReply: true,
          replyReason: 'asks a question',
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
      deleteDraft: jest.fn().mockResolvedValue(undefined),
    };
    const tasksService = {
      createFromExtraction: jest.fn().mockResolvedValue([]),
    };
    const documentsService = { search: jest.fn().mockResolvedValue([]) };
    const meetingSchedulingService = { autoSchedule: jest.fn() };
    const calendarContextService = {
      buildAvailabilityContext: jest.fn().mockResolvedValue(null),
    };
    const matchedRules = options.rule
      ? [{ id: 'rule-1', name: 'Rule 1', actions: options.rule }]
      : [];
    const workflowRuleService = {
      // Builds the rule context like the real service would, so a broken
      // context builder fails these tests too.
      evaluate: jest.fn(
        async (
          _accountId: string,
          resolveContext: (needsKnownContact: boolean) => Promise<unknown>,
        ) => {
          await resolveContext(false);
          return matchedRules;
        },
      ),
      executeActions: jest.fn().mockResolvedValue(undefined),
      isKnownContact: jest.fn().mockResolvedValue(false),
    };
    const agentService = { getEnabledSystemPrompt: jest.fn() };
    const contactService = {
      touchLastContacted: jest.fn().mockResolvedValue(undefined),
      findByEmail: jest.fn().mockResolvedValue(null),
    };
    const notificationService = { create: jest.fn().mockResolvedValue({}) };
    const approvalChainService = { create: jest.fn().mockResolvedValue({}) };
    const queueService = { enqueueScheduledSend: jest.fn() };
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
      queueService as never,
    );

    const run = () =>
      processor.process({
        name: AIJobs.ProcessMessage,
        data: { messageId },
      } as Job<{ messageId: string }>);

    return {
      run,
      processor,
      documentsService,
      contactService,
      ledger,
      prisma,
      aiClientService,
      composeService,
      tasksService,
      workflowRuleService,
      notificationService,
      approvalChainService,
      queueService,
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
        data: {
          aiProcessedAt: expect.any(Date) as Date,
          aiFailedAt: null,
          aiError: null,
        },
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
          replyAll: false,
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
          needsReply: true,
          replyReason: 'asks a question',
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
          {
            type: 'REQUIRE_APPROVAL_CHAIN',
            approverUserIds: ['approver-1'],
            expiresInHours: 12,
          },
        ],
      });

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
      expect(deps.approvalChainService.create).toHaveBeenCalledWith(
        accountId,
        'draft-1',
        ['approver-1'],
        { expiresInHours: 12 },
      );
    });

    it('tells the user when the approval chain could not be started', async () => {
      const deps = buildDeps({
        rule: [
          { type: 'REQUIRE_APPROVAL_CHAIN', approverUserIds: ['outsider'] },
        ],
      });
      deps.approvalChainService.create.mockRejectedValue(
        new Error('Approvers must be members of this account'),
      );

      await deps.run();

      expect(deps.composeService.saveDraftReply).toHaveBeenCalledTimes(1);
      expect(deps.notificationService.create).toHaveBeenCalledWith(
        userId,
        "Approval chain couldn't be started",
        expect.stringContaining('Approvers must be members'),
        expect.objectContaining({ draftId: 'draft-1' }),
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

  describe('concurrency', () => {
    it('falls back to a draft when another job claimed a send to the same thread concurrently', async () => {
      const deps = buildDeps({ rule: AUTO_REPLY_RULE });
      // Simulate a second job for another message in this thread claiming
      // its send between our cap pre-check and our own claim.
      const realCreate = deps.ledger.create.getMockImplementation()!;
      deps.ledger.create.mockImplementation((args) => {
        if (args.data.kind === 'SEND') {
          deps.ledger.rows.set('concurrent-message:SEND', {
            messageId: 'concurrent-message',
            threadId,
            accountId,
            kind: 'SEND',
            status: 'PENDING',
            recipient: senderAddress.toLowerCase(),
          });
        }
        return realCreate(args);
      });

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
      expect(deps.composeService.saveDraftReply).toHaveBeenCalledTimes(1);
      // Our claim was released, the other job's is untouched.
      expect(deps.ledger.rows.has(`${messageId}:SEND`)).toBe(false);
      expect(deps.ledger.rows.has('concurrent-message:SEND')).toBe(true);
    });
  });

  describe('failure visibility', () => {
    function failedJob(attemptsMade: number) {
      return {
        data: { messageId },
        attemptsMade,
        opts: { attempts: 3 },
      } as unknown as Job<{ messageId: string }>;
    }

    it('records the failure on the message and notifies after the last attempt', async () => {
      const deps = buildDeps();
      deps.prisma.emailMessage.update.mockResolvedValue({
        threadId,
        thread: { account: { userId } },
      });

      await deps.processor.onFailed(failedJob(3), new Error('LLM down'));

      expect(deps.prisma.emailMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: messageId },
          data: { aiFailedAt: expect.any(Date) as Date, aiError: 'LLM down' },
        }),
      );
      expect(deps.notificationService.create).toHaveBeenCalledWith(
        userId,
        'AI processing failed',
        expect.any(String),
        { threadId, messageId },
      );
    });

    it('does nothing while retries remain', async () => {
      const deps = buildDeps();

      await deps.processor.onFailed(failedJob(1), new Error('LLM down'));

      expect(deps.prisma.emailMessage.update).not.toHaveBeenCalled();
    });

    it('sends at most one failure notification per hour', async () => {
      const deps = buildDeps();
      deps.prisma.emailMessage.update.mockResolvedValue({
        threadId,
        thread: { account: { userId } },
      });
      deps.prisma.notification.count.mockResolvedValue(1);

      await deps.processor.onFailed(failedJob(3), new Error('LLM down'));

      expect(deps.notificationService.create).not.toHaveBeenCalled();
    });
  });

  describe('document grounding gate (prompt-injection containment)', () => {
    const chunk = {
      id: 'chunk-1',
      documentId: 'doc-1',
      filename: 'pricing.pdf',
      distance: 0.1,
      content:
        'Enterprise tier pricing: 42 dollars per seat per month with a minimum of 200 seats, volume discount of 18 percent above 1,000 seats, and a confidential partner rebate.',
    };

    it('holds a document-grounded reply to an unknown sender for review', async () => {
      const deps = buildDeps({ rule: AUTO_REPLY_RULE });
      deps.documentsService.search.mockResolvedValue([chunk]);

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
      expect(deps.aiClientService.validateReply).not.toHaveBeenCalled();
      expect(deps.composeService.saveDraftReply).toHaveBeenCalledTimes(1);
    });

    it('lets a rule opt in to grounded auto-replies for unknown senders', async () => {
      const deps = buildDeps({
        rule: [{ type: 'AUTO_REPLY', allowUnknownSenderGrounding: true }],
      });
      deps.documentsService.search.mockResolvedValue([chunk]);

      await deps.run();

      expect(deps.composeService.reply).toHaveBeenCalledTimes(1);
    });

    it('never auto-sends a verbatim quote of a document to an external sender, even a known one', async () => {
      const deps = buildDeps({ rule: AUTO_REPLY_RULE });
      deps.documentsService.search.mockResolvedValue([chunk]);
      deps.contactService.findByEmail.mockResolvedValue({ id: 'contact-1' });
      deps.aiClientService.generateReply.mockResolvedValue({
        reply: `Here you go: ${chunk.content}`,
        provider: 'test',
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      });

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
      expect(deps.composeService.saveDraftReply).toHaveBeenCalledTimes(1);
    });

    it('auto-sends a grounded paraphrase to a known sender', async () => {
      const deps = buildDeps({ rule: AUTO_REPLY_RULE });
      deps.documentsService.search.mockResolvedValue([chunk]);
      deps.contactService.findByEmail.mockResolvedValue({ id: 'contact-1' });

      await deps.run();

      expect(deps.composeService.reply).toHaveBeenCalledTimes(1);
    });
  });

  describe('reply need and one reply per conversation', () => {
    const HOUR = 60 * 60 * 1000;
    const at = (hoursAfter: number) =>
      new Date(RECEIVED_AT.getTime() + hoursAfter * HOUR);
    const row = (
      id: string,
      from: string,
      receivedAt: Date,
      bodyText = 'Can you confirm the delivery date?',
      extra: Record<string, unknown> = {},
    ) => ({
      id,
      from: [{ address: from }],
      to: [{ address: 'support@company.com' }],
      cc: [],
      bodyText,
      receivedAt,
      isAutoReply: false,
      ...extra,
    });
    const current = () =>
      row(messageId, senderAddress, RECEIVED_AT, 'Where is my order?');

    function withThread(
      rows: ReturnType<typeof row>[],
      overrides: Record<string, unknown> = {},
    ) {
      return buildMessage({ ...overrides, thread: { messages: rows } });
    }

    function classifyAs(needsReply: boolean, replyReason: string) {
      return {
        classification: {
          category: 'General',
          priority: 'Low',
          sentiment: 'Neutral',
          spam: false,
          language: 'en',
          containsPii: false,
          piiTypes: [],
          needsReply,
          replyReason,
        },
      };
    }

    it('generates no reply when the model says none is needed, but still runs routing actions', async () => {
      const deps = buildDeps({ rule: AUTO_REPLY_RULE });
      deps.aiClientService.classify.mockResolvedValue(
        classifyAs(false, 'FYI only'),
      );

      await deps.run();

      expect(deps.aiClientService.generateReply).not.toHaveBeenCalled();
      expect(deps.composeService.saveDraftReply).not.toHaveBeenCalled();
      expect(deps.workflowRuleService.executeActions).toHaveBeenCalledTimes(1);
      expect(deps.prisma.emailMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            needsReply: false,
            replyReason: 'FYI only',
          }) as unknown,
        }),
      );
    });

    it('skips an acknowledgement without needing the model to decide', async () => {
      const deps = buildDeps({
        message: buildMessage({ bodyText: 'Thanks so much!\nCasey' }),
      });

      await deps.run();

      expect(deps.aiClientService.generateReply).not.toHaveBeenCalled();
      expect(deps.prisma.emailMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            needsReply: false,
            replyReason: 'acknowledgement only',
          }) as unknown,
        }),
      );
    });

    it('sends the model only the new text of each message, not quoted history', async () => {
      const deps = buildDeps({
        message: withThread([
          row(
            messageId,
            senderAddress,
            RECEIVED_AT,
            'Where is my order?\n\nOn Mon, Support <support@company.com> wrote:\n> It ships soon',
          ),
        ]),
      });

      await deps.run();

      const [, thread] = deps.aiClientService.classify.mock.calls[0] as [
        string,
        { content: string }[],
      ];
      expect(thread[0].content).toBe('Where is my order?');
    });

    it('does not reply when the user already answered after this message', async () => {
      const deps = buildDeps({
        message: withThread([
          current(),
          row('mine', 'support@company.com', at(1), 'It ships today.'),
        ]),
      });

      await deps.run();

      expect(deps.aiClientService.generateReply).not.toHaveBeenCalled();
    });

    it('leaves the reply to a newer message from the sender that may need one', async () => {
      const deps = buildDeps({
        message: withThread([
          current(),
          row('newer', senderAddress, at(1), 'Also, can I change the address?'),
        ]),
      });

      await deps.run();

      expect(deps.aiClientService.generateReply).not.toHaveBeenCalled();
    });

    it('is not superseded by a newer acknowledgement or automatic reply', async () => {
      const deps = buildDeps({
        message: withThread([
          current(),
          row('thanks', senderAddress, at(1), 'Thanks!'),
          row('ooo', 'colleague@example.com', at(2), 'I am away', {
            isAutoReply: true,
          }),
        ]),
      });

      await deps.run();

      expect(deps.aiClientService.generateReply).toHaveBeenCalledTimes(1);
    });

    it('answers the conversation from the newest message even when it alone needs no reply', async () => {
      // This message (the newest) is an FYI; the question before it was
      // superseded by it, so this job must be the one that replies.
      const fyi = 'FYI cc-ing my colleague Pat on this.';
      const deps = buildDeps({
        message: withThread(
          [
            row('earlier', senderAddress, at(-1), 'When will my order ship?'),
            row(messageId, senderAddress, RECEIVED_AT, fyi),
          ],
          { bodyText: fyi },
        ),
      });
      deps.aiClientService.classify.mockResolvedValue(
        classifyAs(false, 'FYI only'),
      );

      await deps.run();

      expect(deps.aiClientService.generateReply).toHaveBeenCalledTimes(1);
    });

    it('replaces an untouched AI draft for an earlier message in the thread', async () => {
      const deps = buildDeps({
        message: withThread([row('earlier', senderAddress, at(-2)), current()]),
      });
      deps.prisma.emailMessage.findMany.mockResolvedValue([
        {
          id: 'stale-draft',
          bodyText: 'Old AI text',
          generationMetadata: { draftText: 'Old AI text' },
          approvalChain: null,
        },
      ]);

      await deps.run();

      expect(deps.composeService.deleteDraft).toHaveBeenCalledWith(
        userId,
        'stale-draft',
      );
      expect(deps.composeService.saveDraftReply).toHaveBeenCalledTimes(1);
    });

    it('keeps a human-edited earlier draft and does not pile another reply on top', async () => {
      const deps = buildDeps({
        message: withThread([row('earlier', senderAddress, at(-2)), current()]),
      });
      deps.prisma.emailMessage.findMany.mockResolvedValue([
        {
          id: 'edited-draft',
          bodyText: 'Edited by a human',
          generationMetadata: { draftText: 'Old AI text' },
          approvalChain: null,
        },
      ]);

      await deps.run();

      expect(deps.composeService.deleteDraft).not.toHaveBeenCalled();
      expect(deps.aiClientService.generateReply).not.toHaveBeenCalled();
    });
  });

  describe('automation rules and limits (phase 5)', () => {
    const withAccount = (account: Record<string, unknown>) =>
      buildMessage({ account });

    it('evaluates rules against the fresh classification and runs every matched rule', async () => {
      const deps = buildDeps({ rule: [{ type: 'ADD_LABEL', label: 'x' }] });
      let ruleContext: Record<string, unknown> | undefined;
      deps.workflowRuleService.evaluate.mockImplementation(
        async (_accountId, resolveContext) => {
          ruleContext = (await resolveContext(false)) as Record<
            string,
            unknown
          >;
          return [
            {
              id: 'a',
              name: 'A',
              actions: [{ type: 'ADD_LABEL', label: 'x' }],
            },
            { id: 'b', name: 'B', actions: [{ type: 'NOTIFY', userId: 'u' }] },
          ];
        },
      );

      await deps.run();

      expect(ruleContext).toMatchObject({
        category: 'Support',
        sender: senderAddress.toLowerCase(),
        isFirstMessage: true,
      });
      expect(deps.workflowRuleService.executeActions).toHaveBeenCalledWith(
        [
          expect.objectContaining({ id: 'a' }),
          expect.objectContaining({ id: 'b' }),
        ],
        expect.objectContaining({
          ownerUserId: userId,
          subject: 'Order question',
          isAutoReply: false,
        }),
      );
    });

    it('lets the first rule with a reply action decide, even if a later one says AUTO_REPLY', async () => {
      const deps = buildDeps();
      deps.workflowRuleService.evaluate.mockResolvedValue([
        { id: 'hold', name: 'Hold', actions: [{ type: 'REQUIRE_APPROVAL' }] },
        { id: 'send', name: 'Send', actions: [{ type: 'AUTO_REPLY' }] },
      ]);

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
      expect(deps.composeService.saveDraftReply).toHaveBeenCalledTimes(1);
    });

    it("uses the account's own confidence threshold", async () => {
      const deps = buildDeps({
        rule: AUTO_REPLY_RULE,
        validationConfidence: 90,
        message: withAccount({ autoSendConfidenceThreshold: 95 }),
      });

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
    });

    it('holds as a draft over the hourly cap and tells the owner once', async () => {
      const deps = buildDeps({
        rule: AUTO_REPLY_RULE,
        message: withAccount({ autoSendHourlyCap: 1 }),
      });
      deps.ledger.rows.set('other-message:SEND', {
        messageId: 'other-message',
        threadId: 'other-thread',
        accountId,
        kind: 'SEND',
        status: 'DONE',
        recipient: 'someone@else.com',
      });

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
      expect(deps.composeService.saveDraftReply).toHaveBeenCalledTimes(1);
      expect(deps.notificationService.create).toHaveBeenCalledWith(
        userId,
        'Auto-send limit reached',
        expect.stringContaining('per hour'),
      );
    });

    it('does not count a cancelled scheduled send toward the caps', async () => {
      const deps = buildDeps({
        rule: AUTO_REPLY_RULE,
        message: withAccount({ autoSendHourlyCap: 1 }),
      });
      deps.ledger.rows.set('other-message:SEND', {
        messageId: 'other-message',
        threadId: 'other-thread',
        accountId,
        kind: 'SEND',
        status: 'CANCELLED',
        recipient: 'someone@else.com',
      });

      await deps.run();

      expect(deps.composeService.reply).toHaveBeenCalledTimes(1);
    });

    it('schedules the send as a cancellable draft during the undo window', async () => {
      const deps = buildDeps({
        rule: AUTO_REPLY_RULE,
        message: withAccount({ undoSendSeconds: 30 }),
      });
      const before = Date.now();

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
      const [, , , , options] = deps.composeService.saveDraftReply.mock
        .calls[0] as [
        unknown,
        unknown,
        unknown,
        unknown,
        { scheduledSendAt: Date },
      ];
      expect(options.scheduledSendAt.getTime()).toBeGreaterThanOrEqual(
        before + 30_000,
      );
      expect(deps.queueService.enqueueScheduledSend).toHaveBeenCalledWith(
        'draft-1',
        options.scheduledSendAt,
      );
      expect(deps.ledger.rows.get(`${messageId}:SEND`)).toMatchObject({
        status: 'SCHEDULED',
        details: expect.objectContaining({
          draftMessageId: 'draft-1',
        }) as unknown,
      });
      expect(deps.ledger.rows.get(`${messageId}:DRAFT`)).toMatchObject({
        status: 'DONE',
      });
    });

    it('delays the send by a matched DELAY_SEND', async () => {
      const deps = buildDeps({
        rule: [{ type: 'AUTO_REPLY' }, { type: 'DELAY_SEND', minutes: 10 }],
      });

      await deps.run();

      expect(deps.composeService.reply).not.toHaveBeenCalled();
      expect(deps.queueService.enqueueScheduledSend).toHaveBeenCalledTimes(1);
    });

    it('records why the reply was allowed to send, for the audit log', async () => {
      const deps = buildDeps({ rule: AUTO_REPLY_RULE });

      await deps.run();

      expect(deps.ledger.rows.get(`${messageId}:SEND`)).toMatchObject({
        status: 'DONE',
        details: {
          rule: { id: 'rule-1', name: 'Rule 1' },
          confidence: 90,
          documents: [],
        },
      });
    });

    it('writes as the account owner and appends their signature after generation', async () => {
      const deps = buildDeps({
        rule: AUTO_REPLY_RULE,
        message: withAccount({
          signatureText: 'Alex Kim\n555-0100',
          user: {
            timezone: 'UTC',
            displayName: 'Alex Kim',
            jobTitle: 'Support Lead',
            companyName: 'Acme',
          },
        }),
      });

      await deps.run();

      expect(deps.aiClientService.generateReply).toHaveBeenCalledWith(
        'Order question',
        expect.anything(),
        undefined,
        undefined,
        {
          name: 'Alex Kim',
          jobTitle: 'Support Lead',
          company: 'Acme',
          hasSignature: true,
        },
      );
      const [, sent] = deps.composeService.reply.mock.calls[0] as [
        string,
        { bodyText: string },
      ];
      expect(sent.bodyText).toBe(
        'Hi Casey,\n\nIt ships <b>today</b>.\n\nAlex Kim\n555-0100',
      );
    });
  });
});
