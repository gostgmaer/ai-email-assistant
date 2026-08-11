import { BadRequestException } from '@nestjs/common';

import type { EmailAccountService } from '../../email-account/services/email-account.service';
import type { IntegrationService } from '../../integration/services/integration.service';
import type { NotificationService } from '../../notification/services/notification.service';
import {
  WorkflowAction,
  WorkflowCondition,
} from '../types/workflow-rule.types';
import { WorkflowRuleService } from './workflow-rule.service';

describe('WorkflowRuleService', () => {
  const userId = 'user-1';
  const accountId = 'account-1';

  function buildDeps() {
    const prisma = {
      workflowRule: {
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      accountMember: {
        findUnique: jest.fn(),
      },
      emailThread: {
        update: jest.fn(),
      },
    };

    const emailAccountService = {
      getOwnedAccountOrThrow: jest.fn().mockResolvedValue({ id: accountId }),
    } as unknown as jest.Mocked<EmailAccountService>;

    const notificationService = {
      create: jest.fn(),
    } as unknown as jest.Mocked<NotificationService>;

    const integrationService = {
      postMessage: jest.fn(),
    } as unknown as jest.Mocked<IntegrationService>;

    const service = new WorkflowRuleService(
      prisma as never,
      emailAccountService,
      notificationService,
      integrationService,
    );

    return {
      service,
      prisma,
      emailAccountService,
      notificationService,
      integrationService,
    };
  }

  function rule(
    conditions: WorkflowCondition[],
    actions: WorkflowAction[],
    order = 0,
  ) {
    return { id: `rule-${order}`, conditions, actions, order, enabled: true };
  }

  describe('evaluate', () => {
    it('returns null when no rule matches', async () => {
      const { service, prisma } = buildDeps();
      prisma.workflowRule.findMany.mockResolvedValue([
        rule(
          [{ field: 'category', operator: 'equals', value: 'Sales' }],
          [{ type: 'AUTO_REPLY' }],
        ),
      ]);

      const result = await service.evaluate(accountId, {
        category: 'Support',
        priority: 'Normal',
        sender: 'a@example.com',
      });

      expect(result).toBeNull();
    });

    it('only queries enabled rules, ordered by `order` then createdAt', async () => {
      const { service, prisma } = buildDeps();
      prisma.workflowRule.findMany.mockResolvedValue([]);

      await service.evaluate(accountId, {
        category: 'x',
        priority: 'x',
        sender: 'x',
      });

      expect(prisma.workflowRule.findMany).toHaveBeenCalledWith({
        where: { accountId, enabled: true },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('is first-match-wins across multiple rules', async () => {
      const { service, prisma } = buildDeps();
      prisma.workflowRule.findMany.mockResolvedValue([
        rule([], [{ type: 'REQUIRE_APPROVAL' }], 0), // catch-all, matches everything
        rule(
          [{ field: 'category', operator: 'equals', value: 'Support' }],
          [{ type: 'AUTO_REPLY' }],
          1,
        ),
      ]);

      const result = await service.evaluate(accountId, {
        category: 'Support',
        priority: 'Normal',
        sender: 'a@example.com',
      });

      // The catch-all (order 0) is first in the array and has an empty
      // conditions array, so it wins even though the second rule's
      // condition would also match.
      expect(result).toEqual([{ type: 'REQUIRE_APPROVAL' }]);
    });

    it('requires ALL conditions to match (AND)', async () => {
      const { service, prisma } = buildDeps();
      prisma.workflowRule.findMany.mockResolvedValue([
        rule(
          [
            { field: 'category', operator: 'equals', value: 'Support' },
            { field: 'priority', operator: 'equals', value: 'High' },
          ],
          [{ type: 'AUTO_REPLY' }],
        ),
      ]);

      const partialMatch = await service.evaluate(accountId, {
        category: 'Support',
        priority: 'Normal',
        sender: 'a@example.com',
      });
      expect(partialMatch).toBeNull();

      const fullMatch = await service.evaluate(accountId, {
        category: 'Support',
        priority: 'High',
        sender: 'a@example.com',
      });
      expect(fullMatch).toEqual([{ type: 'AUTO_REPLY' }]);
    });

    it('matches case-insensitively for both equals and contains', async () => {
      const { service, prisma } = buildDeps();
      prisma.workflowRule.findMany.mockResolvedValue([
        rule(
          [
            {
              field: 'sender',
              operator: 'contains',
              value: 'BOSS@Company.com',
            },
          ],
          [{ type: 'NOTIFY', userId: 'u1' }],
        ),
      ]);

      const result = await service.evaluate(accountId, {
        category: 'x',
        priority: 'x',
        sender: 'assistant-to-boss@company.com',
      });

      expect(result).toEqual([{ type: 'NOTIFY', userId: 'u1' }]);
    });
  });

  describe('executeActions', () => {
    const context = { accountId, threadId: 'thread-1', messageId: 'msg-1' };

    it('reports autoReply: true only when AUTO_REPLY is present', async () => {
      const { service } = buildDeps();

      const withAutoReply = await service.executeActions(
        [{ type: 'AUTO_REPLY' }],
        context,
      );
      expect(withAutoReply.autoReply).toBe(true);

      const withoutAutoReply = await service.executeActions(
        [{ type: 'REQUIRE_APPROVAL' }],
        context,
      );
      expect(withoutAutoReply.autoReply).toBe(false);
    });

    it('assigns the thread when the target user has account access', async () => {
      const { service, prisma } = buildDeps();
      prisma.accountMember.findUnique.mockResolvedValue({ id: 'member-1' });

      await service.executeActions(
        [{ type: 'ASSIGN_TO', userId: 'u2' }],
        context,
      );

      expect(prisma.emailThread.update).toHaveBeenCalledWith({
        where: { id: context.threadId },
        data: { assignedToUserId: 'u2' },
      });
    });

    it('skips assignment (does not throw) when the target user has no account access', async () => {
      const { service, prisma } = buildDeps();
      prisma.accountMember.findUnique.mockResolvedValue(null);

      await service.executeActions(
        [{ type: 'ASSIGN_TO', userId: 'stranger' }],
        context,
      );

      expect(prisma.emailThread.update).not.toHaveBeenCalled();
    });

    it('creates a notification for NOTIFY', async () => {
      const { service, notificationService } = buildDeps();

      await service.executeActions(
        [{ type: 'NOTIFY', userId: 'u3', message: 'heads up' }],
        context,
      );

      /* eslint-disable-next-line @typescript-eslint/unbound-method -- jest.fn() mock, never called unbound */
      expect(notificationService.create).toHaveBeenCalledWith(
        'u3',
        'Workflow rule matched',
        'heads up',
        { threadId: context.threadId, messageId: context.messageId },
      );
    });

    it('posts to Slack for POST_TO_SLACK', async () => {
      const { service, integrationService } = buildDeps();

      await service.executeActions(
        [
          {
            type: 'POST_TO_SLACK',
            integrationId: 'integration-1',
            channelId: 'C123',
            message: 'new message!',
          },
        ],
        context,
      );

      /* eslint-disable-next-line @typescript-eslint/unbound-method -- jest.fn() mock, never called unbound */
      expect(integrationService.postMessage).toHaveBeenCalledWith(
        'integration-1',
        'C123',
        'new message!',
      );
    });

    it('does not let one failing action block the others', async () => {
      const { service, prisma, notificationService } = buildDeps();
      notificationService.create.mockRejectedValue(new Error('notify failed'));
      prisma.accountMember.findUnique.mockResolvedValue({ id: 'member-1' });

      const result = await service.executeActions(
        [
          { type: 'NOTIFY', userId: 'u3' },
          { type: 'ASSIGN_TO', userId: 'u2' },
          { type: 'AUTO_REPLY' },
        ],
        context,
      );

      expect(prisma.emailThread.update).toHaveBeenCalled();
      expect(result.autoReply).toBe(true);
    });
  });

  describe('create', () => {
    it('requires ownership before creating a rule', async () => {
      const { service, emailAccountService, prisma } = buildDeps();
      prisma.workflowRule.create.mockResolvedValue({});

      await service.create(userId, accountId, {
        name: 'Test',
        conditions: [
          { field: 'category', operator: 'equals', value: 'Support' },
        ],
        actions: [{ type: 'AUTO_REPLY' }],
      });

      /* eslint-disable-next-line @typescript-eslint/unbound-method -- jest.fn() mock, never called unbound */
      expect(emailAccountService.getOwnedAccountOrThrow).toHaveBeenCalledWith(
        userId,
        accountId,
      );
    });

    it('rejects a condition with an invalid field', async () => {
      const { service } = buildDeps();

      await expect(
        service.create(userId, accountId, {
          name: 'Test',
          conditions: [
            {
              field: 'not-a-real-field' as never,
              operator: 'equals',
              value: 'x',
            },
          ],
          actions: [{ type: 'AUTO_REPLY' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an ASSIGN_TO action with no userId', async () => {
      const { service } = buildDeps();

      await expect(
        service.create(userId, accountId, {
          name: 'Test',
          conditions: [],
          actions: [{ type: 'ASSIGN_TO' } as never],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a POST_TO_SLACK action with no channelId', async () => {
      const { service } = buildDeps();

      await expect(
        service.create(userId, accountId, {
          name: 'Test',
          conditions: [],
          actions: [{ type: 'POST_TO_SLACK', integrationId: 'i1' } as never],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an empty actions array', async () => {
      const { service } = buildDeps();

      await expect(
        service.create(userId, accountId, {
          name: 'Test',
          conditions: [],
          actions: [],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
