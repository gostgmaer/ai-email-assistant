import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../database';
import type { InputJsonValue } from '../../../generated/prisma/internal/prismaNamespace';
// Leaf-file imports — see documents.controller.ts's comment for why
// (avoids a Jest-only circular require).
import { EmailAccountService } from '../../email-account/services/email-account.service';
import { IntegrationService } from '../../integration/services/integration.service';
import { NotificationService } from '../../notification/services/notification.service';
import {
  WorkflowAction,
  WorkflowCondition,
  WorkflowConditionField,
  WorkflowConditionOperator,
} from '../types/workflow-rule.types';

const CONDITION_FIELDS: WorkflowConditionField[] = [
  'category',
  'priority',
  'sender',
];
const CONDITION_OPERATORS: WorkflowConditionOperator[] = ['equals', 'contains'];
const ACTION_TYPES: WorkflowAction['type'][] = [
  'AUTO_REPLY',
  'ASSIGN_TO',
  'NOTIFY',
  'POST_TO_SLACK',
  'REQUIRE_APPROVAL',
  'REQUIRE_APPROVAL_CHAIN',
];

export interface WorkflowClassificationInput {
  category: string;
  priority: string;
  sender: string;
}

export interface WorkflowActionContext {
  accountId: string;
  threadId: string;
  messageId: string;
}

@Injectable()
export class WorkflowRuleService {
  private readonly logger = new Logger(WorkflowRuleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailAccountService: EmailAccountService,
    private readonly notificationService: NotificationService,
    private readonly integrationService: IntegrationService,
  ) {}

  /** Rules are account configuration — owner-only, same tier as filters/
   * auto-schedule, not Shared Inbox member-accessible. */
  async listForAccount(userId: string, accountId: string) {
    await this.emailAccountService.getOwnedAccountOrThrow(userId, accountId);

    return this.prisma.workflowRule.findMany({
      where: { accountId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(
    userId: string,
    accountId: string,
    data: {
      name: string;
      enabled?: boolean;
      order?: number;
      conditions: WorkflowCondition[];
      actions: WorkflowAction[];
    },
  ) {
    await this.emailAccountService.getOwnedAccountOrThrow(userId, accountId);
    this.validateConditions(data.conditions);
    this.validateActions(data.actions);

    return this.prisma.workflowRule.create({
      data: {
        accountId,
        name: data.name,
        enabled: data.enabled ?? true,
        order: data.order ?? 0,
        conditions: data.conditions as unknown as InputJsonValue,
        actions: data.actions,
      },
    });
  }

  async update(
    userId: string,
    accountId: string,
    ruleId: string,
    data: {
      name?: string;
      enabled?: boolean;
      order?: number;
      conditions?: WorkflowCondition[];
      actions?: WorkflowAction[];
    },
  ) {
    await this.emailAccountService.getOwnedAccountOrThrow(userId, accountId);

    if (data.conditions) this.validateConditions(data.conditions);
    if (data.actions) this.validateActions(data.actions);

    // updateMany scoped by { id, accountId } avoids a check-then-update
    // race and never throws for a rule on someone else's account — it
    // just matches zero rows, reported as 404 (same pattern used
    // throughout this codebase, e.g. TasksService.updateStatus).
    const { count } = await this.prisma.workflowRule.updateMany({
      where: { id: ruleId, accountId },
      data: {
        name: data.name,
        enabled: data.enabled,
        order: data.order,
        conditions: data.conditions as unknown as InputJsonValue | undefined,
        actions: data.actions,
      },
    });

    if (count === 0) {
      throw new NotFoundException('Workflow rule not found');
    }

    return this.prisma.workflowRule.findUniqueOrThrow({
      where: { id: ruleId },
    });
  }

  async delete(
    userId: string,
    accountId: string,
    ruleId: string,
  ): Promise<void> {
    await this.emailAccountService.getOwnedAccountOrThrow(userId, accountId);
    await this.prisma.workflowRule.deleteMany({
      where: { id: ruleId, accountId },
    });
  }

  /**
   * Called by AiProcessingProcessor after classification. First enabled
   * rule (ordered by `order`, then createdAt) whose conditions ALL match
   * wins; returns its actions. Null means no rule matched — the caller
   * falls through to the existing default (draft for review).
   */
  async evaluate(
    accountId: string,
    input: WorkflowClassificationInput,
  ): Promise<WorkflowAction[] | null> {
    const rules = await this.prisma.workflowRule.findMany({
      where: { accountId, enabled: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    for (const rule of rules) {
      const conditions = rule.conditions as unknown as WorkflowCondition[];
      if (conditions.every((condition) => matchesCondition(condition, input))) {
        return rule.actions as unknown as WorkflowAction[];
      }
    }

    return null;
  }

  /**
   * Executes a matched rule's actions. Best-effort per action — one
   * failing action (e.g. NOTIFY to a userId that turns out invalid)
   * must not block the others or the reply pipeline itself. Returns
   * whether an AUTO_REPLY action was present (the signal
   * AiProcessingProcessor needs to decide send-vs-draft) and the
   * approver list for REQUIRE_APPROVAL_CHAIN, if present — the chain
   * itself is created later by the caller, once a draft message actually
   * exists to gate (see AiProcessingProcessor). approvalChainApproverUserIds
   * always forces autoReply to false: a chain must never be skipped just
   * because the same rule also happens to include AUTO_REPLY.
   */
  async executeActions(
    actions: WorkflowAction[],
    context: WorkflowActionContext,
  ): Promise<{ autoReply: boolean; approvalChainApproverUserIds?: string[] }> {
    let autoReply = false;
    let approvalChainApproverUserIds: string[] | undefined;

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'AUTO_REPLY':
            autoReply = true;
            break;

          case 'REQUIRE_APPROVAL':
            break;

          case 'REQUIRE_APPROVAL_CHAIN':
            approvalChainApproverUserIds = action.approverUserIds;
            break;

          case 'ASSIGN_TO':
            await this.assignThread(
              context.accountId,
              context.threadId,
              action.userId,
            );
            break;

          case 'NOTIFY':
            await this.notificationService.create(
              action.userId,
              'Workflow rule matched',
              action.message ?? 'A workflow rule matched a new message.',
              { threadId: context.threadId, messageId: context.messageId },
            );
            break;

          case 'POST_TO_SLACK':
            await this.integrationService.postMessage(
              action.integrationId,
              action.channelId,
              action.message ??
                `A workflow rule matched a new message (thread ${context.threadId}).`,
            );
            break;
        }
      } catch (error) {
        this.logger.warn(
          `Workflow action ${action.type} failed for thread ${context.threadId}: ${String(error)}`,
        );
      }
    }

    if (approvalChainApproverUserIds) {
      autoReply = false;
    }

    return { autoReply, approvalChainApproverUserIds };
  }

  private async assignThread(
    accountId: string,
    threadId: string,
    assigneeUserId: string,
  ): Promise<void> {
    const membership = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId, userId: assigneeUserId } },
    });

    if (!membership) {
      this.logger.warn(
        `Workflow ASSIGN_TO skipped: user ${assigneeUserId} has no access to account ${accountId}`,
      );
      return;
    }

    await this.prisma.emailThread.update({
      where: { id: threadId },
      data: { assignedToUserId: assigneeUserId },
    });
  }

  private validateConditions(
    conditions: unknown,
  ): asserts conditions is WorkflowCondition[] {
    if (!Array.isArray(conditions)) {
      throw new BadRequestException('conditions must be an array');
    }

    for (const condition of conditions as unknown[]) {
      const c = condition as Partial<WorkflowCondition>;
      if (!c.field || !CONDITION_FIELDS.includes(c.field)) {
        throw new BadRequestException(
          `condition.field must be one of: ${CONDITION_FIELDS.join(', ')}`,
        );
      }
      if (!c.operator || !CONDITION_OPERATORS.includes(c.operator)) {
        throw new BadRequestException(
          `condition.operator must be one of: ${CONDITION_OPERATORS.join(', ')}`,
        );
      }
      if (typeof c.value !== 'string' || c.value.trim().length === 0) {
        throw new BadRequestException(
          'condition.value must be a non-empty string',
        );
      }
    }
  }

  private validateActions(
    actions: unknown,
  ): asserts actions is WorkflowAction[] {
    if (!Array.isArray(actions) || actions.length === 0) {
      throw new BadRequestException('actions must be a non-empty array');
    }

    for (const action of actions as unknown[]) {
      const a = action as Partial<WorkflowAction>;
      if (!a.type || !ACTION_TYPES.includes(a.type)) {
        throw new BadRequestException(
          `action.type must be one of: ${ACTION_TYPES.join(', ')}`,
        );
      }
      if (
        (a.type === 'ASSIGN_TO' || a.type === 'NOTIFY') &&
        typeof (a as { userId?: unknown }).userId !== 'string'
      ) {
        throw new BadRequestException(
          `action.userId is required for ${a.type}`,
        );
      }

      if (a.type === 'POST_TO_SLACK') {
        const slackAction = a as {
          integrationId?: unknown;
          channelId?: unknown;
        };
        if (typeof slackAction.integrationId !== 'string') {
          throw new BadRequestException(
            'action.integrationId is required for POST_TO_SLACK',
          );
        }
        if (typeof slackAction.channelId !== 'string') {
          throw new BadRequestException(
            'action.channelId is required for POST_TO_SLACK',
          );
        }
      }

      if (a.type === 'REQUIRE_APPROVAL_CHAIN') {
        const approverUserIds = (a as { approverUserIds?: unknown })
          .approverUserIds;
        if (
          !Array.isArray(approverUserIds) ||
          approverUserIds.length === 0 ||
          !approverUserIds.every((id) => typeof id === 'string')
        ) {
          throw new BadRequestException(
            'action.approverUserIds must be a non-empty array of user IDs for REQUIRE_APPROVAL_CHAIN',
          );
        }
      }
    }
  }
}

function matchesCondition(
  condition: WorkflowCondition,
  input: WorkflowClassificationInput,
): boolean {
  const actual = (input[condition.field] ?? '').toLowerCase();
  const expected = condition.value.toLowerCase();

  return condition.operator === 'equals'
    ? actual === expected
    : actual.includes(expected);
}
