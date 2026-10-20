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
import { MailProviderFactory } from '../../email/providers/mail-provider.factory';
import { ComposeService } from '../../email/services/compose.service';
import { textToSafeHtml } from '../../email/utils/text-to-html.util';
import { IntegrationService } from '../../integration/services/integration.service';
import { NotificationService } from '../../notification/services/notification.service';
import {
  LegacyWorkflowCondition,
  ReplyAction,
  RuleActionResult,
  WorkflowAction,
  WorkflowConditionGroup,
  isReplyAction,
} from '../types/workflow-rule.types';
import {
  RuleMessageContext,
  evaluateConditions,
  normalizeConditions,
  referencesField,
  validateConditions,
} from '../utils/rule-conditions.util';
import { buildRuleMessageContext } from '../utils/rule-context.util';
import {
  assertWebhookUrl,
  generateWebhookSecret,
  postWebhook,
} from '../utils/webhook.util';

const ACTION_TYPES: WorkflowAction['type'][] = [
  'AUTO_REPLY',
  'ASSIGN_TO',
  'NOTIFY',
  'POST_TO_SLACK',
  'POST_TO_TEAMS',
  'CREATE_HUBSPOT_CONTACT',
  'REQUIRE_APPROVAL',
  'REQUIRE_APPROVAL_CHAIN',
  'FORWARD',
  'ADD_LABEL',
  'MOVE_TO_FOLDER',
  'ARCHIVE',
  'MARK_READ',
  'SNOOZE',
  'CREATE_TASK',
  'WEBHOOK',
  'DELAY_SEND',
  'STOP_PROCESSING',
];

const DRY_RUN_SAMPLE_SIZE = 50;
const EMAIL_ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
// RFC 3834: marks the forward as machine-generated so the recipient's
// auto-responders don't answer it.
const FORWARD_HEADERS = { 'Auto-Submitted': 'auto-generated' };

export interface MatchedRule {
  id: string;
  name: string;
  actions: WorkflowAction[];
}

export interface WorkflowActionContext {
  accountId: string;
  /** The account owner — tasks are created for them, and mailbox actions
   * (forward, label, move) act with their access. */
  ownerUserId: string;
  threadId: string;
  messageId: string;
  // Only needed for CREATE_HUBSPOT_CONTACT — the sender of the message
  // that triggered this rule, not user input.
  senderEmail: string;
  senderName?: string;
  subject: string;
  category: string;
  priority: string;
  /** The inbound message is itself an automatic reply. FORWARD skips such
   * messages so two automated mailboxes can't forward to each other
   * forever. */
  isAutoReply: boolean;
}

export interface RuleDryRunResult {
  /** How many recent classified messages were checked. */
  evaluated: number;
  matches: {
    messageId: string;
    threadId: string;
    subject: string | null;
    sender: string;
    receivedAt: Date;
    category: string | null;
    priority: string | null;
  }[];
  /** What would have run for each match. Nothing is executed. */
  plannedActions: WorkflowAction[];
}

type ActionMessage = Awaited<
  ReturnType<WorkflowRuleService['loadActionMessage']>
>;

@Injectable()
export class WorkflowRuleService {
  private readonly logger = new Logger(WorkflowRuleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailAccountService: EmailAccountService,
    private readonly notificationService: NotificationService,
    private readonly integrationService: IntegrationService,
    private readonly mailProviderFactory: MailProviderFactory,
    private readonly composeService: ComposeService,
  ) {}

  /** Rules are account configuration — owner-only, same tier as filters/
   * auto-schedule, not Shared Inbox member-accessible. */
  async listForAccount(userId: string, accountId: string) {
    await this.emailAccountService.getOwnedAccountOrThrow(userId, accountId);

    const rules = await this.prisma.workflowRule.findMany({
      where: { accountId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return rules.map((rule) => ({
      ...rule,
      conditions: normalizeConditions(rule.conditions),
    }));
  }

  async create(
    userId: string,
    accountId: string,
    data: {
      name: string;
      enabled?: boolean;
      order?: number;
      conditions: WorkflowConditionGroup | LegacyWorkflowCondition[];
      actions: WorkflowAction[];
    },
  ) {
    await this.emailAccountService.getOwnedAccountOrThrow(userId, accountId);
    const conditions = prepareConditions(data.conditions);
    const actions = await this.prepareActions(accountId, data.actions);

    return this.prisma.workflowRule.create({
      data: {
        accountId,
        name: data.name,
        enabled: data.enabled ?? true,
        order: data.order ?? 0,
        conditions: conditions as unknown as InputJsonValue,
        actions,
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
      conditions?: WorkflowConditionGroup | LegacyWorkflowCondition[];
      actions?: WorkflowAction[];
    },
  ) {
    await this.emailAccountService.getOwnedAccountOrThrow(userId, accountId);

    const conditions = data.conditions
      ? prepareConditions(data.conditions)
      : undefined;
    const actions = data.actions
      ? await this.prepareActions(accountId, data.actions)
      : undefined;

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
        conditions: conditions as unknown as InputJsonValue | undefined,
        actions,
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
   * Called by AiProcessingProcessor after classification. Every enabled
   * rule (ordered by `order`, then createdAt) whose conditions match is
   * returned, in order, up to and including the first one with a
   * STOP_PROCESSING action. Empty means no rule matched — the caller
   * falls through to the default (draft for review).
   *
   * resolveContext builds the message's condition inputs; it's told
   * whether any rule tests isKnownContact so that lookup is skipped when
   * nobody asks.
   */
  async evaluate(
    accountId: string,
    resolveContext: (needsKnownContact: boolean) => Promise<RuleMessageContext>,
  ): Promise<MatchedRule[]> {
    const rules = await this.loadEnabledRules(accountId);
    if (rules.length === 0) {
      return [];
    }

    const context = await resolveContext(
      rules.some((rule) => referencesField(rule.conditions, 'isKnownContact')),
    );
    return matchRules(rules, context);
  }

  /** A CRM contact, or someone this account has sent mail to. */
  async isKnownContact(accountId: string, address: string): Promise<boolean> {
    const normalized = address.toLowerCase();
    const contact = await this.prisma.contact.findFirst({
      where: { accountId, email: { equals: normalized, mode: 'insensitive' } },
      select: { id: true },
    });
    if (contact) {
      return true;
    }

    return (
      (await this.prisma.emailMessage.count({
        where: {
          thread: { accountId },
          to: { array_contains: [{ address: normalized }] },
        },
      })) > 0
    );
  }

  /**
   * "Test rule": evaluates a saved rule (ruleId) or an unsaved one
   * (conditions + actions) against the account's last 50 classified
   * inbound messages. Read-only — nothing is executed, nothing recorded.
   */
  async dryRun(
    userId: string,
    accountId: string,
    input:
      | { ruleId: string }
      | {
          conditions: WorkflowConditionGroup | LegacyWorkflowCondition[];
          actions?: WorkflowAction[];
        },
  ): Promise<RuleDryRunResult> {
    await this.emailAccountService.getOwnedAccountOrThrow(userId, accountId);

    let conditions: WorkflowConditionGroup;
    let actions: WorkflowAction[];
    if ('ruleId' in input) {
      const rule = await this.prisma.workflowRule.findFirst({
        where: { id: input.ruleId, accountId },
      });
      if (!rule) {
        throw new NotFoundException('Workflow rule not found');
      }
      conditions = normalizeConditions(rule.conditions);
      actions = rule.actions as unknown as WorkflowAction[];
    } else {
      conditions = prepareConditions(input.conditions);
      actions = input.actions ?? [];
    }

    const account = await this.prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
      select: {
        businessHoursStart: true,
        businessHoursEnd: true,
        businessDays: true,
        user: { select: { timezone: true } },
      },
    });

    const messages = await this.prisma.emailMessage.findMany({
      where: {
        thread: {
          accountId,
          folder: { type: { notIn: ['DRAFTS', 'SENT'] } },
        },
        category: { not: null },
      },
      orderBy: { receivedAt: 'desc' },
      take: DRY_RUN_SAMPLE_SIZE,
      include: {
        thread: {
          select: {
            subject: true,
            messages: { select: { id: true, receivedAt: true } },
          },
        },
      },
    });

    const needsKnownContact = referencesField(conditions, 'isKnownContact');
    const matches: RuleDryRunResult['matches'] = [];

    for (const message of messages) {
      const context = buildRuleMessageContext({
        message,
        threadReceivedAt: message.thread.messages
          .filter((other) => other.id !== message.id)
          .map((other) => other.receivedAt),
        threadSubject: message.thread.subject,
        account,
        timezone: account.user.timezone,
        isKnownContact: false,
      });
      if (needsKnownContact && context.sender) {
        context.isKnownContact = await this.isKnownContact(
          accountId,
          context.sender,
        );
      }

      if (evaluateConditions(conditions, context)) {
        matches.push({
          messageId: message.id,
          threadId: message.threadId,
          subject: message.thread.subject ?? message.subject,
          sender: context.sender,
          receivedAt: message.receivedAt,
          category: message.category,
          priority: message.priority,
        });
      }
    }

    return {
      evaluated: messages.length,
      matches,
      plannedActions: actions.map(redactSecrets),
    };
  }

  /**
   * Runs the matched rules' actions, in rule order. Best-effort per
   * action — one failing action (a NOTIFY to a userId that turns out
   * invalid, an unreachable webhook) never blocks the others or the reply
   * pipeline. Each rule's run is recorded as a RuleExecution. The reply
   * decision itself is resolveReplyDirectives(), which has no side
   * effects; here reply actions are only recorded as deciding or ignored.
   */
  async executeActions(
    matched: MatchedRule[],
    context: WorkflowActionContext,
  ): Promise<void> {
    const decidingRuleId = findDecidingRule(matched)?.id;
    let delayApplied = false;
    let message: Promise<ActionMessage> | undefined;
    const loadMessage = () =>
      (message ??= this.loadActionMessage(context.messageId));

    for (const rule of matched) {
      const startedAt = Date.now();
      const results: RuleActionResult[] = [];

      for (const action of rule.actions) {
        if (isReplyAction(action)) {
          results.push(
            rule.id === decidingRuleId
              ? {
                  type: action.type,
                  status: 'done',
                  detail: 'decides the reply',
                }
              : {
                  type: action.type,
                  status: 'skipped',
                  detail: 'an earlier rule already decides the reply',
                },
          );
          continue;
        }
        if (action.type === 'DELAY_SEND') {
          results.push(
            delayApplied
              ? {
                  type: action.type,
                  status: 'skipped',
                  detail: 'an earlier rule already set a delay',
                }
              : {
                  type: action.type,
                  status: 'done',
                  detail: 'applies if the reply auto-sends',
                },
          );
          delayApplied = true;
          continue;
        }

        try {
          results.push(
            await this.runSideEffect(action, context, rule, loadMessage),
          );
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Workflow action ${action.type} (rule ${rule.id}) failed for thread ${context.threadId}: ${detail}`,
          );
          results.push({ type: action.type, status: 'failed', detail });
        }
      }

      await this.prisma.ruleExecution
        .create({
          data: {
            accountId: context.accountId,
            ruleId: rule.id,
            ruleName: rule.name,
            messageId: context.messageId,
            actions: rule.actions.map(redactSecrets),
            results: results as unknown as InputJsonValue,
            durationMs: Date.now() - startedAt,
          },
        })
        .catch((error: unknown) => {
          this.logger.warn(
            `Couldn't record execution of rule ${rule.id}: ${describeError(error)}`,
          );
        });
    }
  }

  private async runSideEffect(
    action: Exclude<WorkflowAction, ReplyAction | { type: 'DELAY_SEND' }>,
    context: WorkflowActionContext,
    rule: MatchedRule,
    loadMessage: () => Promise<ActionMessage>,
  ): Promise<RuleActionResult> {
    const done = (detail?: string): RuleActionResult => ({
      type: action.type,
      status: 'done',
      detail,
    });
    const skipped = (detail: string): RuleActionResult => ({
      type: action.type,
      status: 'skipped',
      detail,
    });

    switch (action.type) {
      case 'ASSIGN_TO':
        return (await this.assignThread(
          context.accountId,
          context.threadId,
          action.userId,
        ))
          ? done()
          : skipped(`user ${action.userId} has no access to this account`);

      case 'NOTIFY':
        await this.notificationService.create(
          action.userId,
          'Workflow rule matched',
          action.message ?? 'A workflow rule matched a new message.',
          { threadId: context.threadId, messageId: context.messageId },
        );
        return done();

      case 'POST_TO_SLACK':
        await this.integrationService.postMessage(
          action.integrationId,
          action.channelId,
          action.message ??
            `A workflow rule matched a new message (thread ${context.threadId}).`,
        );
        return done();

      case 'POST_TO_TEAMS':
        await this.integrationService.postToTeamsChannel(
          action.integrationId,
          action.teamId,
          action.channelId,
          action.message ??
            `A workflow rule matched a new message (thread ${context.threadId}).`,
        );
        return done();

      case 'CREATE_HUBSPOT_CONTACT': {
        const [firstName, ...rest] = (context.senderName ?? '').split(' ');
        await this.integrationService.upsertHubspotContact(
          action.integrationId,
          {
            email: context.senderEmail,
            firstName: firstName || undefined,
            lastName: rest.join(' ') || undefined,
          },
        );
        return done();
      }

      case 'STOP_PROCESSING':
        return done('lower rules were not evaluated');

      case 'SNOOZE': {
        const until = new Date(Date.now() + action.minutes * 60_000);
        await this.prisma.emailThread.update({
          where: { id: context.threadId },
          data: { snoozedUntil: until },
        });
        return done(`until ${until.toISOString()}`);
      }

      case 'CREATE_TASK': {
        await this.prisma.task.create({
          data: {
            userId: context.ownerUserId,
            emailMessageId: context.messageId,
            threadId: context.threadId,
            type: 'ACTION_ITEM',
            description:
              action.description?.trim() ||
              `Follow up: ${context.subject || '(no subject)'}`,
            dueDate:
              action.dueInDays !== undefined
                ? new Date(Date.now() + action.dueInDays * 86_400_000)
                : undefined,
          },
        });
        return done();
      }

      case 'WEBHOOK': {
        const message = await loadMessage();
        await postWebhook(action.url, action.secret ?? '', {
          event: 'rule.matched',
          rule: { id: rule.id, name: rule.name },
          accountId: context.accountId,
          message: {
            id: context.messageId,
            threadId: context.threadId,
            from: context.senderEmail,
            subject: context.subject,
            category: context.category,
            priority: context.priority,
            receivedAt: message.receivedAt.toISOString(),
            snippet: (message.bodyText ?? '').slice(0, 200),
          },
        });
        return done();
      }

      case 'FORWARD': {
        if (context.isAutoReply) {
          return skipped('the message is an automatic reply');
        }
        await this.forward(action, context, await loadMessage());
        return done(`to ${action.to}`);
      }

      case 'MARK_READ': {
        const message = await loadMessage();
        const client = await this.mailProviderFactory.createClient(
          message.thread.account,
        );
        await client.markAsRead(
          message.providerMessageId,
          message.thread.folder.providerFolderId ?? undefined,
        );
        await this.prisma.emailMessage.update({
          where: { id: message.id },
          data: { isRead: true },
        });
        return done();
      }

      case 'ADD_LABEL': {
        const message = await loadMessage();
        const client = await this.mailProviderFactory.createClient(
          message.thread.account,
        );
        if (!client.addLabel) {
          return skipped(
            `not supported for ${message.thread.account.provider} accounts`,
          );
        }
        await client.addLabel(
          message.providerMessageId,
          action.label,
          message.thread.folder.providerFolderId ?? undefined,
        );
        return done(action.label);
      }

      case 'MOVE_TO_FOLDER':
      case 'ARCHIVE':
        return this.moveMessage(action, context, await loadMessage());
    }
  }

  private async forward(
    action: Extract<WorkflowAction, { type: 'FORWARD' }>,
    context: WorkflowActionContext,
    message: ActionMessage,
  ): Promise<void> {
    const header = [
      '---------- Forwarded message ---------',
      `From: ${formatParticipants(message.from)}`,
      `Date: ${message.receivedAt.toUTCString()}`,
      `Subject: ${context.subject}`,
      `To: ${formatParticipants(message.to)}`,
    ].join('\n');
    const note = action.note?.trim();

    await this.composeService.send(
      context.ownerUserId,
      {
        accountId: context.accountId,
        to: [{ address: action.to }],
        subject: `Fwd: ${context.subject.replace(/^Fwd:\s*/i, '')}`,
        bodyText: [note, header, message.bodyText ?? '']
          .filter(Boolean)
          .join('\n\n'),
        bodyHtml: [
          note ? textToSafeHtml(note) : '',
          textToSafeHtml(header),
          message.bodyHtml ?? textToSafeHtml(message.bodyText ?? ''),
        ]
          .filter(Boolean)
          .join('<br><br>'),
      },
      { headers: FORWARD_HEADERS },
    );
  }

  /** MOVE_TO_FOLDER / ARCHIVE: moves the message at the provider, then
   * files the local thread under the destination so the app's folder views
   * agree. A provider that re-keys moved messages (Graph) returns the new
   * id, which the stored row follows — replies are created from it. */
  private async moveMessage(
    action: Extract<WorkflowAction, { type: 'MOVE_TO_FOLDER' | 'ARCHIVE' }>,
    context: WorkflowActionContext,
    message: ActionMessage,
  ): Promise<RuleActionResult> {
    const client = await this.mailProviderFactory.createClient(
      message.thread.account,
    );
    const source = message.thread.folder.providerFolderId ?? undefined;
    let newProviderId: string | undefined;
    let localFolderId: string;

    if (action.type === 'MOVE_TO_FOLDER') {
      const target = await this.prisma.mailFolder.findFirst({
        where: { id: action.folderId, accountId: context.accountId },
      });
      if (!target?.providerFolderId) {
        return {
          type: action.type,
          status: 'skipped',
          detail: 'the destination folder no longer exists',
        };
      }
      if (!client.moveMessage) {
        return {
          type: action.type,
          status: 'skipped',
          detail: `not supported for ${message.thread.account.provider} accounts`,
        };
      }
      newProviderId = await client.moveMessage(
        message.providerMessageId,
        target.providerFolderId,
        source,
      );
      localFolderId = target.id;
    } else {
      if (!client.archiveMessage) {
        return {
          type: action.type,
          status: 'skipped',
          detail: `not supported for ${message.thread.account.provider} accounts`,
        };
      }
      newProviderId = await client.archiveMessage(
        message.providerMessageId,
        source,
      );
      localFolderId = (await this.findOrCreateArchiveFolder(context.accountId))
        .id;
    }

    if (newProviderId && newProviderId !== message.providerMessageId) {
      await this.prisma.emailMessage.update({
        where: { id: message.id },
        data: { providerMessageId: newProviderId },
      });
    }
    await this.prisma.emailThread.update({
      where: { id: context.threadId },
      data: { folderId: localFolderId },
    });
    return { type: action.type, status: 'done' };
  }

  private async findOrCreateArchiveFolder(accountId: string) {
    return (
      (await this.prisma.mailFolder.findFirst({
        where: { accountId, type: 'ARCHIVE' },
      })) ??
      this.prisma.mailFolder.create({
        data: { accountId, type: 'ARCHIVE', name: 'Archive' },
      })
    );
  }

  private loadActionMessage(messageId: string) {
    return this.prisma.emailMessage.findUniqueOrThrow({
      where: { id: messageId },
      include: { thread: { include: { folder: true, account: true } } },
    });
  }

  private async loadEnabledRules(accountId: string) {
    const rules = await this.prisma.workflowRule.findMany({
      where: { accountId, enabled: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    return rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      conditions: normalizeConditions(rule.conditions),
      actions: rule.actions as unknown as WorkflowAction[],
    }));
  }

  private async assignThread(
    accountId: string,
    threadId: string,
    assigneeUserId: string,
  ): Promise<boolean> {
    const membership = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId, userId: assigneeUserId } },
    });

    if (!membership) {
      this.logger.warn(
        `Workflow ASSIGN_TO skipped: user ${assigneeUserId} has no access to account ${accountId}`,
      );
      return false;
    }

    await this.prisma.emailThread.update({
      where: { id: threadId },
      data: { assignedToUserId: assigneeUserId },
    });
    return true;
  }

  /** Validates actions and fills in what the server owns (webhook secrets).
   * A WEBHOOK action saved without a secret gets a new one; an existing
   * secret is kept so the receiver's verification keeps working. */
  private async prepareActions(
    accountId: string,
    actions: unknown,
  ): Promise<WorkflowAction[]> {
    this.validateActions(actions);
    await this.validateApproverAccess(accountId, actions);
    await this.validateFolders(accountId, actions);

    return actions.map((action) =>
      action.type === 'WEBHOOK' && !action.secret
        ? { ...action, secret: generateWebhookSecret() }
        : action,
    );
  }

  /** Approval-chain approvers must be members of the account — they get to
   * read the drafted reply and the conversation behind it. Checked at save
   * time (and again when a chain is created, see ApprovalChainService). */
  private async validateApproverAccess(
    accountId: string,
    actions: WorkflowAction[],
  ): Promise<void> {
    const approverUserIds = actions.flatMap((action) =>
      action.type === 'REQUIRE_APPROVAL_CHAIN' ? action.approverUserIds : [],
    );
    if (approverUserIds.length === 0) {
      return;
    }

    const members = await this.prisma.accountMember.findMany({
      where: { accountId, userId: { in: approverUserIds } },
      select: { userId: true },
    });
    const memberIds = new Set(members.map((member) => member.userId));
    const outsiders = approverUserIds.filter((id) => !memberIds.has(id));

    if (outsiders.length > 0) {
      throw new BadRequestException(
        `Approvers must be members of this account; not a member: ${outsiders.join(', ')}`,
      );
    }
  }

  private async validateFolders(
    accountId: string,
    actions: WorkflowAction[],
  ): Promise<void> {
    const folderIds = actions.flatMap((action) =>
      action.type === 'MOVE_TO_FOLDER' ? [action.folderId] : [],
    );
    if (folderIds.length === 0) {
      return;
    }

    const found = await this.prisma.mailFolder.count({
      where: {
        id: { in: folderIds },
        accountId,
        providerFolderId: { not: null },
      },
    });
    if (found !== new Set(folderIds).size) {
      throw new BadRequestException(
        'MOVE_TO_FOLDER needs one of this account’s synced folders',
      );
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

      if (a.type === 'POST_TO_TEAMS') {
        const teamsAction = a as {
          integrationId?: unknown;
          teamId?: unknown;
          channelId?: unknown;
        };
        if (typeof teamsAction.integrationId !== 'string') {
          throw new BadRequestException(
            'action.integrationId is required for POST_TO_TEAMS',
          );
        }
        if (typeof teamsAction.teamId !== 'string') {
          throw new BadRequestException(
            'action.teamId is required for POST_TO_TEAMS',
          );
        }
        if (typeof teamsAction.channelId !== 'string') {
          throw new BadRequestException(
            'action.channelId is required for POST_TO_TEAMS',
          );
        }
      }

      if (
        a.type === 'CREATE_HUBSPOT_CONTACT' &&
        typeof (a as { integrationId?: unknown }).integrationId !== 'string'
      ) {
        throw new BadRequestException(
          'action.integrationId is required for CREATE_HUBSPOT_CONTACT',
        );
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
        const expiresInHours = (a as { expiresInHours?: unknown })
          .expiresInHours;
        if (
          expiresInHours !== undefined &&
          (typeof expiresInHours !== 'number' ||
            !(expiresInHours > 0) ||
            expiresInHours > 720)
        ) {
          throw new BadRequestException(
            'action.expiresInHours must be a number of hours between 0 and 720',
          );
        }
      }

      validateNewActionFields(a);
    }
  }
}

/** Field checks for the phase 5 action types. */
function validateNewActionFields(action: Partial<WorkflowAction>): void {
  const a = action as Record<string, unknown> & { type?: string };
  const text = (key: string, max: number, required = true) => {
    const value = a[key];
    if (value === undefined && !required) return;
    if (
      typeof value !== 'string' ||
      value.trim().length === 0 ||
      value.length > max
    ) {
      throw new BadRequestException(
        `action.${key} for ${a.type} must be text of 1-${max} characters`,
      );
    }
  };
  const integer = (key: string, min: number, max: number, required = true) => {
    const value = a[key];
    if (value === undefined && !required) return;
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < min ||
      value > max
    ) {
      throw new BadRequestException(
        `action.${key} for ${a.type} must be a whole number from ${min} to ${max}`,
      );
    }
  };

  switch (a.type) {
    case 'FORWARD':
      if (typeof a.to !== 'string' || !EMAIL_ADDRESS.test(a.to.trim())) {
        throw new BadRequestException(
          'action.to for FORWARD must be an email address',
        );
      }
      text('note', 2000, false);
      break;
    case 'ADD_LABEL':
      text('label', 100);
      break;
    case 'MOVE_TO_FOLDER':
      text('folderId', 100);
      break;
    case 'SNOOZE':
      // Up to 30 days.
      integer('minutes', 1, 43_200);
      break;
    case 'DELAY_SEND':
      // Up to a day.
      integer('minutes', 1, 1_440);
      break;
    case 'CREATE_TASK':
      text('description', 500, false);
      integer('dueInDays', 0, 365, false);
      break;
    case 'WEBHOOK':
      if (typeof a.url !== 'string') {
        throw new BadRequestException('action.url is required for WEBHOOK');
      }
      try {
        assertWebhookUrl(a.url);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : String(error),
        );
      }
      text('secret', 200, false);
      break;
  }
}

function prepareConditions(
  conditions: WorkflowConditionGroup | LegacyWorkflowCondition[],
): WorkflowConditionGroup {
  // v1 input (a flat list) is still accepted, but an empty list no longer
  // means "match everything" — that has to be asked for with matchAll.
  if (Array.isArray(conditions) && conditions.length === 0) {
    validateConditions({ all: [] });
  }
  const normalized = normalizeConditions(conditions);
  validateConditions(normalized);
  return normalized;
}

/** The rules whose conditions match, in order, stopping after the first
 * one with STOP_PROCESSING. Pure — shared by evaluate() and tests. */
export function matchRules(
  rules: {
    id: string;
    name: string;
    conditions: WorkflowConditionGroup;
    actions: WorkflowAction[];
  }[],
  context: RuleMessageContext,
): MatchedRule[] {
  const matched: MatchedRule[] = [];
  for (const rule of rules) {
    if (!evaluateConditions(rule.conditions, context)) {
      continue;
    }
    matched.push({ id: rule.id, name: rule.name, actions: rule.actions });
    if (rule.actions.some((action) => action.type === 'STOP_PROCESSING')) {
      break;
    }
  }
  return matched;
}

export interface ReplyDirectives {
  autoReply: boolean;
  /** The deciding rule's AUTO_REPLY action — its options (agent persona,
   * calendar agent, reply-all, grounding opt-in) apply to the reply even
   * when it's held as a draft. */
  autoReplyAction?: Extract<WorkflowAction, { type: 'AUTO_REPLY' }>;
  approvalChainApproverUserIds?: string[];
  approvalChainExpiresInHours?: number;
  /** First DELAY_SEND among the matched rules, in minutes. */
  delaySendMinutes?: number;
  /** The rule whose reply action decided — recorded with the send. */
  decidingRule?: { id: string; name: string };
}

function findDecidingRule(matched: MatchedRule[]): MatchedRule | undefined {
  return matched.find((rule) => rule.actions.some(isReplyAction));
}

/**
 * The send-vs-draft decision the matched rules encode, with no side
 * effects — split out of executeActions() so a retried AI job can recover
 * the decision without re-running ASSIGN/NOTIFY/Slack/HubSpot actions that
 * already ran on an earlier attempt.
 *
 * Reply actions are exclusive: the first matching rule that has one
 * decides, and later rules' reply actions are ignored. Within that rule,
 * holding wins over sending — REQUIRE_APPROVAL_CHAIN, then
 * REQUIRE_APPROVAL, then AUTO_REPLY — so a chain or a hold is never
 * skipped because the same rule also says AUTO_REPLY.
 */
export function resolveReplyDirectives(
  matched: MatchedRule[],
): ReplyDirectives {
  const deciding = findDecidingRule(matched);
  const delay = matched
    .flatMap((rule) => rule.actions)
    .find(
      (action): action is Extract<WorkflowAction, { type: 'DELAY_SEND' }> =>
        action.type === 'DELAY_SEND',
    );
  const actions = deciding?.actions ?? [];

  const chainAction = actions.find(
    (
      action,
    ): action is Extract<WorkflowAction, { type: 'REQUIRE_APPROVAL_CHAIN' }> =>
      action.type === 'REQUIRE_APPROVAL_CHAIN',
  );
  const autoReplyAction = actions.find(
    (action): action is Extract<WorkflowAction, { type: 'AUTO_REPLY' }> =>
      action.type === 'AUTO_REPLY',
  );
  const held =
    !!chainAction ||
    actions.some((action) => action.type === 'REQUIRE_APPROVAL');

  return {
    autoReply: !!autoReplyAction && !held,
    autoReplyAction,
    approvalChainApproverUserIds: chainAction?.approverUserIds,
    approvalChainExpiresInHours: chainAction?.expiresInHours,
    delaySendMinutes: delay?.minutes,
    decidingRule: deciding
      ? { id: deciding.id, name: deciding.name }
      : undefined,
  };
}

/** Webhook secrets never leave the rule's own record (history, dry-run). */
function redactSecrets(action: WorkflowAction): WorkflowAction {
  return action.type === 'WEBHOOK' && action.secret
    ? { ...action, secret: '[redacted]' }
    : action;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : JSON.stringify(error);
}

function formatParticipants(list: unknown): string {
  return Array.isArray(list)
    ? (list as { name?: string; address?: string }[])
        .map((p) =>
          p.name && p.address ? `${p.name} <${p.address}>` : (p.address ?? ''),
        )
        .filter(Boolean)
        .join(', ')
    : '';
}
