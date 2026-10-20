import { BadRequestException } from '@nestjs/common';

import type { EmailAccountService } from '../../email-account/services/email-account.service';
import type { IntegrationService } from '../../integration/services/integration.service';
import type { NotificationService } from '../../notification/services/notification.service';
import {
  WorkflowAction,
  WorkflowConditionGroup,
} from '../types/workflow-rule.types';
import { RuleMessageContext } from '../utils/rule-conditions.util';
import { postWebhook } from '../utils/webhook.util';
import {
  MatchedRule,
  WorkflowRuleService,
  resolveReplyDirectives,
} from './workflow-rule.service';

jest.mock('../utils/webhook.util', () => ({
  ...jest.requireActual<object>('../utils/webhook.util'),
  postWebhook: jest.fn(),
}));

describe('WorkflowRuleService', () => {
  const userId = 'user-1';
  const accountId = 'account-1';

  function buildDeps() {
    const prisma = {
      workflowRule: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      accountMember: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      emailThread: { update: jest.fn() },
      emailMessage: {
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      emailAccount: { findUniqueOrThrow: jest.fn() },
      mailFolder: {
        findFirst: jest.fn(),
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      task: { create: jest.fn() },
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
      ruleExecution: { create: jest.fn().mockResolvedValue({}) },
    };

    const emailAccountService = {
      getOwnedAccountOrThrow: jest.fn().mockResolvedValue({ id: accountId }),
    } as unknown as jest.Mocked<EmailAccountService>;

    const notificationService = {
      create: jest.fn(),
    } as unknown as jest.Mocked<NotificationService>;

    const integrationService = {
      postMessage: jest.fn(),
      postToTeamsChannel: jest.fn(),
      upsertHubspotContact: jest.fn(),
    } as unknown as jest.Mocked<IntegrationService>;

    const mailClient = {
      markAsRead: jest.fn(),
      addLabel: jest.fn(),
      moveMessage: jest.fn(),
      archiveMessage: jest.fn(),
    };
    const mailProviderFactory = {
      createClient: jest.fn().mockResolvedValue(mailClient),
    };
    const composeService = { send: jest.fn() };

    const service = new WorkflowRuleService(
      prisma as never,
      emailAccountService,
      notificationService,
      integrationService,
      mailProviderFactory as never,
      composeService as never,
    );

    return {
      service,
      prisma,
      emailAccountService,
      notificationService,
      integrationService,
      mailClient,
      composeService,
    };
  }

  function rule(
    conditions: WorkflowConditionGroup | unknown[],
    actions: WorkflowAction[],
    order = 0,
  ) {
    return {
      id: `rule-${order}`,
      name: `Rule ${order}`,
      conditions,
      actions,
      order,
      enabled: true,
    };
  }

  function context(
    overrides: Partial<RuleMessageContext> = {},
  ): RuleMessageContext {
    return {
      category: 'Support',
      priority: 'Normal',
      sentiment: 'Neutral',
      language: 'en',
      sender: 'a@example.com',
      to: ['support@company.com'],
      cc: [],
      subject: 'Order question',
      body: 'Where is my order?',
      containsPii: false,
      isFirstMessage: true,
      isKnownContact: false,
      withinBusinessHours: true,
      ...overrides,
    };
  }

  const resolve =
    (overrides: Partial<RuleMessageContext> = {}) =>
    () =>
      Promise.resolve(context(overrides));

  const category = (value: string) => ({
    all: [{ field: 'category' as const, op: 'equals' as const, value }],
  });

  describe('evaluate', () => {
    it('returns no rules when none match', async () => {
      const { service, prisma } = buildDeps();
      prisma.workflowRule.findMany.mockResolvedValue([
        rule(category('Sales'), [{ type: 'AUTO_REPLY' }]),
      ]);

      expect(await service.evaluate(accountId, resolve())).toEqual([]);
    });

    it('only queries enabled rules, ordered by `order` then createdAt', async () => {
      const { service, prisma } = buildDeps();

      await service.evaluate(accountId, resolve());

      expect(prisma.workflowRule.findMany).toHaveBeenCalledWith({
        where: { accountId, enabled: true },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('returns every matching rule, in order', async () => {
      const { service, prisma } = buildDeps();
      prisma.workflowRule.findMany.mockResolvedValue([
        rule(category('Support'), [{ type: 'ADD_LABEL', label: 'Support' }], 0),
        rule(category('Sales'), [{ type: 'AUTO_REPLY' }], 1),
        rule({ all: [], matchAll: true }, [{ type: 'AUTO_REPLY' }], 2),
      ]);

      const matched = await service.evaluate(accountId, resolve());

      expect(matched.map((m) => m.id)).toEqual(['rule-0', 'rule-2']);
    });

    it('stops after a rule with STOP_PROCESSING', async () => {
      const { service, prisma } = buildDeps();
      prisma.workflowRule.findMany.mockResolvedValue([
        rule(category('Support'), [{ type: 'STOP_PROCESSING' }], 0),
        rule({ all: [], matchAll: true }, [{ type: 'AUTO_REPLY' }], 1),
      ]);

      const matched = await service.evaluate(accountId, resolve());

      expect(matched.map((m) => m.id)).toEqual(['rule-0']);
    });

    it('still evaluates a v1 rule (flat AND list) stored before the migration', async () => {
      const { service, prisma } = buildDeps();
      prisma.workflowRule.findMany.mockResolvedValue([
        rule(
          [
            { field: 'category', operator: 'equals', value: 'Support' },
            { field: 'sender', operator: 'contains', value: 'EXAMPLE.com' },
          ],
          [{ type: 'NOTIFY', userId: 'u1' }],
        ),
      ]);

      const matched = await service.evaluate(accountId, resolve());

      expect(matched).toHaveLength(1);
    });

    it('only asks for isKnownContact when a rule tests it', async () => {
      const { service, prisma } = buildDeps();
      const resolveContext = jest.fn(resolve());
      prisma.workflowRule.findMany.mockResolvedValue([
        rule(category('Support'), [{ type: 'AUTO_REPLY' }]),
      ]);

      await service.evaluate(accountId, resolveContext);
      expect(resolveContext).toHaveBeenLastCalledWith(false);

      prisma.workflowRule.findMany.mockResolvedValue([
        rule(
          { all: [{ field: 'isKnownContact', op: 'equals', value: true }] },
          [{ type: 'AUTO_REPLY' }],
        ),
      ]);
      await service.evaluate(accountId, resolveContext);
      expect(resolveContext).toHaveBeenLastCalledWith(true);
    });
  });

  describe('executeActions', () => {
    const actionContext = {
      accountId,
      ownerUserId: userId,
      threadId: 'thread-1',
      messageId: 'msg-1',
      senderEmail: 'sender@example.com',
      senderName: 'Sender Name',
      subject: 'Order question',
      category: 'Support',
      priority: 'Normal',
      isAutoReply: false,
    };

    const matched = (
      actions: WorkflowAction[],
      id = 'rule-1',
    ): MatchedRule => ({ id, name: `Rule ${id}`, actions });

    const storedMessage = {
      id: 'msg-1',
      providerMessageId: 'provider-1',
      from: [{ name: 'Sam', address: 'sender@example.com' }],
      to: [{ address: 'support@company.com' }],
      bodyText: 'Where is my order?',
      bodyHtml: null,
      receivedAt: new Date('2026-10-20T09:00:00Z'),
      thread: {
        folder: { providerFolderId: 'INBOX' },
        account: { id: accountId, provider: 'GOOGLE' },
      },
    };

    function recordedResults(prisma: ReturnType<typeof buildDeps>['prisma']) {
      return prisma.ruleExecution.create.mock.calls.map(
        ([arg]) => (arg as { data: { ruleId: string; results: unknown } }).data,
      );
    }

    it('assigns the thread when the target user has account access', async () => {
      const { service, prisma } = buildDeps();
      prisma.accountMember.findUnique.mockResolvedValue({ id: 'member-1' });

      await service.executeActions(
        [matched([{ type: 'ASSIGN_TO', userId: 'u2' }])],
        actionContext,
      );

      expect(prisma.emailThread.update).toHaveBeenCalledWith({
        where: { id: actionContext.threadId },
        data: { assignedToUserId: 'u2' },
      });
    });

    it('records a skipped assignment (and does not throw) when the target user has no access', async () => {
      const { service, prisma } = buildDeps();
      prisma.accountMember.findUnique.mockResolvedValue(null);

      await service.executeActions(
        [matched([{ type: 'ASSIGN_TO', userId: 'stranger' }])],
        actionContext,
      );

      expect(prisma.emailThread.update).not.toHaveBeenCalled();
      expect(recordedResults(prisma)[0].results).toEqual([
        expect.objectContaining({ type: 'ASSIGN_TO', status: 'skipped' }),
      ]);
    });

    it('creates a notification for NOTIFY', async () => {
      const { service, notificationService } = buildDeps();

      await service.executeActions(
        [matched([{ type: 'NOTIFY', userId: 'u3', message: 'heads up' }])],
        actionContext,
      );

      /* eslint-disable-next-line @typescript-eslint/unbound-method -- jest.fn() mock, never called unbound */
      expect(notificationService.create).toHaveBeenCalledWith(
        'u3',
        'Workflow rule matched',
        'heads up',
        { threadId: 'thread-1', messageId: 'msg-1' },
      );
    });

    it('posts to Slack and Teams, and upserts a HubSpot contact from the sender', async () => {
      const { service, integrationService } = buildDeps();

      await service.executeActions(
        [
          matched([
            {
              type: 'POST_TO_SLACK',
              integrationId: 'integration-1',
              channelId: 'C123',
              message: 'new message!',
            },
            {
              type: 'POST_TO_TEAMS',
              integrationId: 'integration-2',
              teamId: 'team-1',
              channelId: 'channel-1',
              message: 'new message!',
            },
            { type: 'CREATE_HUBSPOT_CONTACT', integrationId: 'integration-3' },
          ]),
        ],
        actionContext,
      );

      /* eslint-disable @typescript-eslint/unbound-method -- jest.fn() mocks, never called unbound */
      expect(integrationService.postMessage).toHaveBeenCalledWith(
        'integration-1',
        'C123',
        'new message!',
      );
      expect(integrationService.postToTeamsChannel).toHaveBeenCalledWith(
        'integration-2',
        'team-1',
        'channel-1',
        'new message!',
      );
      expect(integrationService.upsertHubspotContact).toHaveBeenCalledWith(
        'integration-3',
        { email: 'sender@example.com', firstName: 'Sender', lastName: 'Name' },
      );
      /* eslint-enable @typescript-eslint/unbound-method */
    });

    it('does not let one failing action block the others, and records the failure', async () => {
      const { service, prisma, notificationService } = buildDeps();
      notificationService.create.mockRejectedValue(new Error('notify failed'));
      prisma.accountMember.findUnique.mockResolvedValue({ id: 'member-1' });

      await service.executeActions(
        [
          matched([
            { type: 'NOTIFY', userId: 'u3' },
            { type: 'ASSIGN_TO', userId: 'u2' },
          ]),
        ],
        actionContext,
      );

      expect(prisma.emailThread.update).toHaveBeenCalled();
      expect(recordedResults(prisma)[0].results).toEqual([
        { type: 'NOTIFY', status: 'failed', detail: 'notify failed' },
        { type: 'ASSIGN_TO', status: 'done', detail: undefined },
      ]);
    });

    it('records one execution per matched rule, with later rules’ reply actions ignored', async () => {
      const { service, prisma } = buildDeps();

      await service.executeActions(
        [
          matched([{ type: 'REQUIRE_APPROVAL' }], 'rule-a'),
          matched(
            [{ type: 'AUTO_REPLY' }, { type: 'DELAY_SEND', minutes: 5 }],
            'rule-b',
          ),
        ],
        actionContext,
      );

      const [first, second] = recordedResults(prisma);
      expect(first).toMatchObject({
        ruleId: 'rule-a',
        results: [
          {
            type: 'REQUIRE_APPROVAL',
            status: 'done',
            detail: 'decides the reply',
          },
        ],
      });
      expect(second).toMatchObject({
        ruleId: 'rule-b',
        results: [
          { type: 'AUTO_REPLY', status: 'skipped' },
          { type: 'DELAY_SEND', status: 'done' },
        ],
      });
    });

    it('snoozes the thread for SNOOZE', async () => {
      const { service, prisma } = buildDeps();
      const before = Date.now();

      await service.executeActions(
        [matched([{ type: 'SNOOZE', minutes: 60 }])],
        actionContext,
      );

      const [[call]] = prisma.emailThread.update.mock.calls as [
        [{ data: { snoozedUntil: Date } }],
      ];
      expect(call.data.snoozedUntil.getTime()).toBeGreaterThanOrEqual(
        before + 60 * 60_000,
      );
    });

    it('creates a follow-up task for the account owner for CREATE_TASK', async () => {
      const { service, prisma } = buildDeps();

      await service.executeActions(
        [matched([{ type: 'CREATE_TASK' }])],
        actionContext,
      );

      expect(prisma.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          emailMessageId: 'msg-1',
          type: 'ACTION_ITEM',
          description: 'Follow up: Order question',
        }) as unknown,
      });
    });

    it('forwards the message with an Auto-Submitted header', async () => {
      const { service, prisma, composeService } = buildDeps();
      prisma.emailMessage.findUniqueOrThrow.mockResolvedValue(storedMessage);

      await service.executeActions(
        [matched([{ type: 'FORWARD', to: 'team@example.com', note: 'FYI' }])],
        actionContext,
      );

      const [owner, dto, options] = composeService.send.mock.calls[0] as [
        string,
        { to: unknown; subject: string; bodyText: string },
        unknown,
      ];
      expect(owner).toBe(userId);
      expect(dto.to).toEqual([{ address: 'team@example.com' }]);
      expect(dto.subject).toBe('Fwd: Order question');
      expect(dto.bodyText).toContain('FYI');
      expect(dto.bodyText).toContain('From: Sam <sender@example.com>');
      expect(options).toEqual({
        headers: { 'Auto-Submitted': 'auto-generated' },
      });
    });

    it('never forwards an automatic reply (no forwarding loops)', async () => {
      const { service, composeService } = buildDeps();

      await service.executeActions(
        [matched([{ type: 'FORWARD', to: 'team@example.com' }])],
        { ...actionContext, isAutoReply: true },
      );

      expect(composeService.send).not.toHaveBeenCalled();
    });

    it('archives at the provider, follows a re-keyed message id and files the thread under Archive', async () => {
      const { service, prisma, mailClient } = buildDeps();
      prisma.emailMessage.findUniqueOrThrow.mockResolvedValue(storedMessage);
      mailClient.archiveMessage.mockResolvedValue('provider-1-moved');
      prisma.mailFolder.findFirst.mockResolvedValue({ id: 'archive-folder' });

      await service.executeActions(
        [matched([{ type: 'ARCHIVE' }])],
        actionContext,
      );

      expect(mailClient.archiveMessage).toHaveBeenCalledWith(
        'provider-1',
        'INBOX',
      );
      expect(prisma.emailMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { providerMessageId: 'provider-1-moved' },
      });
      expect(prisma.emailThread.update).toHaveBeenCalledWith({
        where: { id: 'thread-1' },
        data: { folderId: 'archive-folder' },
      });
    });

    it('skips MOVE_TO_FOLDER when the destination folder is gone', async () => {
      const { service, prisma, mailClient } = buildDeps();
      prisma.emailMessage.findUniqueOrThrow.mockResolvedValue(storedMessage);
      prisma.mailFolder.findFirst.mockResolvedValue(null);

      await service.executeActions(
        [matched([{ type: 'MOVE_TO_FOLDER', folderId: 'gone' }])],
        actionContext,
      );

      expect(mailClient.moveMessage).not.toHaveBeenCalled();
      expect(recordedResults(prisma)[0].results).toEqual([
        expect.objectContaining({ status: 'skipped' }),
      ]);
    });

    it('posts the webhook and never records its secret', async () => {
      const { service, prisma } = buildDeps();
      prisma.emailMessage.findUniqueOrThrow.mockResolvedValue(storedMessage);

      await service.executeActions(
        [
          matched([
            {
              type: 'WEBHOOK',
              url: 'https://hooks.example.com/x',
              secret: 's3cret',
            },
          ]),
        ],
        actionContext,
      );

      expect(postWebhook).toHaveBeenCalledWith(
        'https://hooks.example.com/x',
        's3cret',
        expect.objectContaining({ event: 'rule.matched' }),
      );
      expect(JSON.stringify(recordedResults(prisma))).not.toContain('s3cret');
      expect(
        JSON.stringify(prisma.ruleExecution.create.mock.calls),
      ).not.toContain('s3cret');
    });
  });

  describe('create', () => {
    const create = (
      service: WorkflowRuleService,
      conditions: unknown,
      actions: WorkflowAction[] = [{ type: 'AUTO_REPLY' }],
    ) =>
      service.create(userId, accountId, {
        name: 'Test',
        conditions: conditions as WorkflowConditionGroup,
        actions,
      });

    it('refuses approval-chain approvers who are not members of the account', async () => {
      const { service, prisma } = buildDeps();
      prisma.accountMember.findMany.mockResolvedValue([{ userId: 'member-1' }]);

      await expect(
        create(service, category('Sales'), [
          {
            type: 'REQUIRE_APPROVAL_CHAIN',
            approverUserIds: ['member-1', 'outsider-1'],
          },
        ]),
      ).rejects.toThrow('not a member: outsider-1');
      expect(prisma.workflowRule.create).not.toHaveBeenCalled();
    });

    it('rejects an out-of-range approval chain expiry', async () => {
      const { service, prisma } = buildDeps();
      prisma.accountMember.findMany.mockResolvedValue([{ userId: 'member-1' }]);

      await expect(
        create(service, category('Sales'), [
          {
            type: 'REQUIRE_APPROVAL_CHAIN',
            approverUserIds: ['member-1'],
            expiresInHours: 0,
          },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires ownership before creating a rule', async () => {
      const { service, emailAccountService } = buildDeps();

      await create(service, category('Support'));

      /* eslint-disable-next-line @typescript-eslint/unbound-method -- jest.fn() mock, never called unbound */
      expect(emailAccountService.getOwnedAccountOrThrow).toHaveBeenCalledWith(
        userId,
        accountId,
      );
    });

    it('stores v1 input converted to a v2 group', async () => {
      const { service, prisma } = buildDeps();

      await create(service, [
        { field: 'category', operator: 'equals', value: 'Support' },
      ]);

      expect(prisma.workflowRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          conditions: {
            all: [{ field: 'category', op: 'equals', value: 'Support' }],
          },
        }) as unknown,
      });
    });

    it('rejects a rule with no conditions unless it says matchAll', async () => {
      const { service } = buildDeps();

      await expect(create(service, [])).rejects.toThrow(/matchAll/);
      await expect(create(service, { all: [] })).rejects.toThrow(/matchAll/);
      await expect(
        create(service, { all: [], matchAll: true }),
      ).resolves.toBeUndefined();
    });

    it('rejects a condition with an invalid field', async () => {
      const { service } = buildDeps();

      await expect(
        create(service, {
          all: [{ field: 'not-a-real-field', op: 'equals', value: 'x' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('generates a webhook signing secret, and refuses non-public webhook URLs', async () => {
      const { service, prisma } = buildDeps();

      await create(service, category('Support'), [
        { type: 'WEBHOOK', url: 'https://hooks.example.com/x' },
      ]);
      const [[createArgs]] = prisma.workflowRule.create.mock.calls as [
        [{ data: { actions: { secret?: string }[] } }],
      ];
      const saved = createArgs.data.actions[0];
      expect(saved.secret).toMatch(/^[0-9a-f]{48}$/);

      for (const url of [
        'http://hooks.example.com/x',
        'https://127.0.0.1/x',
        'https://localhost/x',
        'https://[::ffff:10.0.0.1]/x',
      ]) {
        await expect(
          create(service, category('Support'), [{ type: 'WEBHOOK', url }]),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    });

    it('rejects a MOVE_TO_FOLDER folder that is not one of the account’s synced folders', async () => {
      const { service, prisma } = buildDeps();
      prisma.mailFolder.count.mockResolvedValue(0);

      await expect(
        create(service, category('Support'), [
          { type: 'MOVE_TO_FOLDER', folderId: 'other-account-folder' },
        ]),
      ).rejects.toThrow(/synced folders/);
    });

    it.each([
      [{ type: 'ASSIGN_TO' }],
      [{ type: 'POST_TO_SLACK', integrationId: 'i1' }],
      [{ type: 'POST_TO_TEAMS', integrationId: 'i1', channelId: 'c1' }],
      [{ type: 'CREATE_HUBSPOT_CONTACT' }],
      [{ type: 'REQUIRE_APPROVAL_CHAIN', approverUserIds: [] }],
      [{ type: 'FORWARD', to: 'not-an-address' }],
      [{ type: 'SNOOZE', minutes: 0 }],
      [{ type: 'DELAY_SEND', minutes: 2000 }],
      [{ type: 'ADD_LABEL', label: '' }],
    ])('rejects the invalid action %j', async (action) => {
      const { service } = buildDeps();

      await expect(
        create(service, category('Support'), [action as never]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an empty actions array', async () => {
      const { service } = buildDeps();

      await expect(
        create(service, category('Support'), []),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('dryRun', () => {
    it('returns the recent messages a rule would match, without running anything', async () => {
      const { service, prisma, notificationService } = buildDeps();
      prisma.workflowRule.findFirst.mockResolvedValue(
        rule(category('Billing'), [{ type: 'NOTIFY', userId: 'u1' }]),
      );
      prisma.emailAccount.findUniqueOrThrow.mockResolvedValue({
        businessHoursStart: '09:00',
        businessHoursEnd: '17:00',
        businessDays: [1, 2, 3, 4, 5],
        user: { timezone: 'UTC' },
      });
      const stored = (id: string, categoryValue: string) => ({
        id,
        threadId: `thread-${id}`,
        from: [{ address: 'payer@example.com' }],
        to: [],
        cc: [],
        subject: 'Invoice',
        bodyText: 'Please pay',
        receivedAt: new Date('2026-10-20T10:00:00Z'),
        category: categoryValue,
        priority: 'Normal',
        sentiment: 'Neutral',
        language: 'en',
        containsPii: false,
        thread: { subject: 'Invoice', messages: [] },
      });
      prisma.emailMessage.findMany.mockResolvedValue([
        stored('m1', 'Billing'),
        stored('m2', 'Support'),
      ]);

      const result = await service.dryRun(userId, accountId, {
        ruleId: 'rule-0',
      });

      expect(result.evaluated).toBe(2);
      expect(result.matches.map((m) => m.messageId)).toEqual(['m1']);
      expect(result.plannedActions).toEqual([{ type: 'NOTIFY', userId: 'u1' }]);
      /* eslint-disable-next-line @typescript-eslint/unbound-method -- jest.fn() mock, never called unbound */
      expect(notificationService.create).not.toHaveBeenCalled();
      expect(prisma.ruleExecution.create).not.toHaveBeenCalled();
    });
  });
});

describe('resolveReplyDirectives', () => {
  const rule = (id: string, actions: WorkflowAction[]): MatchedRule => ({
    id,
    name: id,
    actions,
  });

  it('lets the first rule with a reply action decide, ignoring later ones', () => {
    const directives = resolveReplyDirectives([
      rule('label', [{ type: 'ADD_LABEL', label: 'x' }]),
      rule('hold', [{ type: 'REQUIRE_APPROVAL' }]),
      rule('send', [{ type: 'AUTO_REPLY' }]),
    ]);

    expect(directives.autoReply).toBe(false);
    expect(directives.decidingRule).toEqual({ id: 'hold', name: 'hold' });
  });

  it('auto-sends when the deciding rule says AUTO_REPLY', () => {
    const directives = resolveReplyDirectives([
      rule('send', [{ type: 'AUTO_REPLY', replyAll: true }]),
    ]);

    expect(directives.autoReply).toBe(true);
    expect(directives.autoReplyAction).toEqual({
      type: 'AUTO_REPLY',
      replyAll: true,
    });
  });

  it('never auto-sends when the same rule also holds or requires a chain', () => {
    expect(
      resolveReplyDirectives([
        rule('r', [
          { type: 'AUTO_REPLY' },
          { type: 'REQUIRE_APPROVAL_CHAIN', approverUserIds: ['approver-1'] },
        ]),
      ]),
    ).toMatchObject({
      autoReply: false,
      approvalChainApproverUserIds: ['approver-1'],
    });
    expect(
      resolveReplyDirectives([
        rule('r', [{ type: 'AUTO_REPLY' }, { type: 'REQUIRE_APPROVAL' }]),
      ]).autoReply,
    ).toBe(false);
  });

  it('takes the first DELAY_SEND from any matched rule', () => {
    const directives = resolveReplyDirectives([
      rule('delay', [{ type: 'DELAY_SEND', minutes: 15 }]),
      rule('send', [{ type: 'AUTO_REPLY' }]),
    ]);

    expect(directives).toMatchObject({ autoReply: true, delaySendMinutes: 15 });
  });

  it('decides nothing when no matched rule has a reply action', () => {
    expect(
      resolveReplyDirectives([rule('n', [{ type: 'NOTIFY', userId: 'u' }])]),
    ).toMatchObject({ autoReply: false, decidingRule: undefined });
  });
});
