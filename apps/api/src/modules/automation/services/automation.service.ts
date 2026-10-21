import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../database';
import { QueueService } from '../../../infrastructure/queue';
// Leaf-file imports — see documents.controller.ts's comment for why.
import { EmailAccountService } from '../../email-account/services/email-account.service';
import {
  AUTO_REPLY_HEADERS,
  ComposeService,
} from '../../email/services/compose.service';
import { NotificationService } from '../../notification/services/notification.service';

const RULE_EXECUTION_RETENTION_DAYS = 90;
const AUDIT_LOG_PAGE_SIZE = 50;

export interface AutomationLogEntry {
  kind: 'SEND' | 'RULE';
  at: Date;
  messageId: string;
  threadId: string | null;
  subject: string | null;
  /** SEND: DONE (sent), SCHEDULED, CANCELLED or PENDING (outcome unknown).
   * RULE: whether every action ran (done) or some failed/skipped. */
  status: string;
  recipient?: string | null;
  /** SEND: { rule, confidence, documents, draftMessageId, scheduledFor }. */
  details?: unknown;
  /** RULE only. */
  ruleId?: string | null;
  ruleName?: string;
  results?: unknown;
  durationMs?: number;
}

/**
 * The automation side of scheduled sends and the audit trail
 * (docs/email-automation-implementation-plan.md §5.3, §5.4):
 * - sends an approved auto-reply once its scheduled time comes (it waited
 *   as a draft for the undo window, quiet hours or a DELAY_SEND);
 * - lists what the automation did on an account (sends and rule runs);
 * - drops rule history past retention.
 */
@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly composeService: ComposeService,
    private readonly notificationService: NotificationService,
    private readonly emailAccountService: EmailAccountService,
    private readonly queueService: QueueService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * The send is claimed by moving its SEND effect SCHEDULED -> PENDING in
   * one conditional update. Cancelling (ComposeService) moves the same row
   * SCHEDULED -> CANCELLED, so whichever happens first wins: a cancelled
   * reply never sends, and one that started sending can't be cancelled.
   * The kill switches are checked again here — switching auto-send off
   * stops replies that were already waiting.
   */
  async sendScheduledReply(draftMessageId: string): Promise<void> {
    const draft = await this.prisma.emailMessage.findUnique({
      where: { id: draftMessageId },
      select: {
        id: true,
        scheduledSendAt: true,
        inReplyToMessageId: true,
        subject: true,
        thread: {
          select: {
            account: {
              select: {
                id: true,
                userId: true,
                email: true,
                autoSendEnabled: true,
              },
            },
          },
        },
      },
    });

    // Sent, deleted or cancelled in the meantime.
    if (!draft?.scheduledSendAt || !draft.inReplyToMessageId) {
      return;
    }

    if (draft.scheduledSendAt.getTime() > Date.now() + 1000) {
      // Fired early (e.g. the job was re-added): wait for the real time.
      await this.queueService.enqueueScheduledSend(
        draft.id,
        draft.scheduledSendAt,
      );
      return;
    }

    const account = draft.thread.account;
    const sendEffect = {
      messageId: draft.inReplyToMessageId,
      kind: 'SEND' as const,
    };

    const disabledReason =
      this.configService.get<string>('AUTO_SEND_ENABLED') === 'false'
        ? 'auto-send is disabled globally'
        : !account.autoSendEnabled
          ? `auto-send was turned off for ${account.email}`
          : null;
    if (disabledReason) {
      await this.cancelScheduled(draft.id, draft.inReplyToMessageId);
      await this.notify(
        account.userId,
        'Scheduled auto-reply held',
        `A reply to "${draft.subject ?? '(no subject)'}" was not sent because ${disabledReason}. It's in Drafts.`,
        draft,
      );
      return;
    }

    const { count } = await this.prisma.automationEffect.updateMany({
      where: { ...sendEffect, status: 'SCHEDULED' },
      data: { status: 'PENDING' },
    });
    if (count === 0) {
      // Cancelled (or already sending) — leave the draft for the user.
      return;
    }

    let sent: { providerMessageId: string };
    try {
      sent = await this.composeService.sendDraft(account.userId, draft.id, {
        headers: AUTO_REPLY_HEADERS,
        fromSchedule: true,
      });
    } catch (error) {
      // Nothing went out: put it back so the job's retry can try again.
      await this.prisma.automationEffect.updateMany({
        where: { ...sendEffect, status: 'PENDING' },
        data: { status: 'SCHEDULED' },
      });
      throw error;
    }

    await this.prisma.automationEffect.update({
      where: { messageId_kind: sendEffect },
      data: { status: 'DONE', providerMessageId: sent.providerMessageId },
    });

    this.logger.log(
      `Sent scheduled auto-reply ${draft.id} (reply to message ${draft.inReplyToMessageId}).`,
    );
    await this.notify(
      account.userId,
      'Auto-replied to an email',
      `Sent from ${account.email} — "${draft.subject ?? '(no subject)'}"`,
      draft,
    );
  }

  /** After the last retry failed: the reply stays in Drafts, off its
   * schedule, and the owner is told. */
  async giveUpScheduledReply(
    draftMessageId: string,
    error: Error,
  ): Promise<void> {
    const draft = await this.prisma.emailMessage.findUnique({
      where: { id: draftMessageId },
      select: {
        id: true,
        inReplyToMessageId: true,
        subject: true,
        thread: { select: { account: { select: { userId: true } } } },
      },
    });
    if (!draft?.inReplyToMessageId) {
      return;
    }

    await this.cancelScheduled(draft.id, draft.inReplyToMessageId);
    await this.notify(
      draft.thread.account.userId,
      "Scheduled auto-reply couldn't be sent",
      `A reply to "${draft.subject ?? '(no subject)'}" failed to send (${error.message}). It's in Drafts.`,
      draft,
    );
  }

  /**
   * A snoozed thread's time is up: it's unsnoozed (back in the inbox) and
   * whoever owns it — the assignee, else the account owner — is told.
   * `until` is what the job was scheduled for; a thread that was re-snoozed
   * or unsnoozed since then doesn't match and is left alone.
   */
  async wakeSnoozedThread(threadId: string, until: string): Promise<void> {
    const thread = await this.prisma.emailThread.findUnique({
      where: { id: threadId },
      select: {
        subject: true,
        snoozedUntil: true,
        assignedToUserId: true,
        account: { select: { userId: true } },
      },
    });
    if (
      !thread?.snoozedUntil ||
      thread.snoozedUntil.getTime() !== new Date(until).getTime()
    ) {
      return;
    }

    const { count } = await this.prisma.emailThread.updateMany({
      where: { id: threadId, snoozedUntil: thread.snoozedUntil },
      data: { snoozedUntil: null },
    });
    if (count === 0) {
      return;
    }

    await this.notificationService
      .create(
        thread.assignedToUserId ?? thread.account.userId,
        'A snoozed conversation is back',
        `"${thread.subject ?? '(no subject)'}" is back in your inbox.`,
        { threadId },
        'SNOOZE_WAKE',
      )
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to notify about woken thread ${threadId}: ${
            error instanceof Error ? error.message : JSON.stringify(error)
          }`,
        );
      });
  }

  /**
   * "Remind me if nobody replies": every thread whose followUpAt has
   * passed is claimed (followUpAt cleared in one conditional update, so two
   * scans can't both act), and if the last message is still the user's own
   * it becomes a FOLLOW_UP task plus a notification. A reply that arrived
   * in the meantime just clears the reminder.
   */
  async runFollowUpScan(now = new Date()): Promise<number> {
    const due = await this.prisma.emailThread.findMany({
      where: { followUpAt: { lte: now } },
      take: 200,
      select: {
        id: true,
        subject: true,
        followUpAt: true,
        lastMessageFromSelf: true,
        assignedToUserId: true,
        account: { select: { userId: true } },
      },
    });

    let reminded = 0;
    for (const thread of due) {
      const { count } = await this.prisma.emailThread.updateMany({
        where: { id: thread.id, followUpAt: thread.followUpAt },
        data: { followUpAt: null },
      });
      if (count === 0 || !thread.lastMessageFromSelf) {
        continue;
      }

      const userId = thread.assignedToUserId ?? thread.account.userId;
      const subject = thread.subject ?? '(no subject)';
      await this.prisma.task.create({
        data: {
          userId,
          threadId: thread.id,
          type: 'FOLLOW_UP',
          description: `No reply yet: ${subject}`,
        },
      });
      await this.notificationService
        .create(
          userId,
          'No reply yet',
          `Nobody has answered "${subject}". A follow-up task was added.`,
          { threadId: thread.id },
          'FOLLOW_UP',
        )
        .catch(() => undefined);
      reminded++;
    }
    return reminded;
  }

  /** Deletes RuleExecution rows older than the retention window. */
  async cleanupRuleExecutions(): Promise<number> {
    const { count } = await this.prisma.ruleExecution.deleteMany({
      where: {
        createdAt: {
          lt: new Date(
            Date.now() - RULE_EXECUTION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
          ),
        },
      },
    });
    return count;
  }

  /**
   * What the automation did on an account, newest first: every autonomous
   * send (with the rule that allowed it, the reply's confidence and the
   * documents it drew on) and every rule run with each action's result.
   * Owner only, like the rules themselves. `before` pages backwards.
   */
  async getAuditLog(
    userId: string,
    accountId: string,
    options: { before?: Date; limit?: number } = {},
  ): Promise<AutomationLogEntry[]> {
    await this.emailAccountService.getOwnedAccountOrThrow(userId, accountId);

    const limit = Math.min(options.limit ?? AUDIT_LOG_PAGE_SIZE, 200);
    const createdAt = options.before ? { lt: options.before } : undefined;

    const [sends, executions] = await Promise.all([
      this.prisma.automationEffect.findMany({
        where: { accountId, kind: 'SEND', createdAt },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { message: { select: { subject: true } } },
      }),
      this.prisma.ruleExecution.findMany({
        where: { accountId, createdAt },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { message: { select: { subject: true, threadId: true } } },
      }),
    ]);

    const entries: AutomationLogEntry[] = [
      ...sends.map((send) => ({
        kind: 'SEND' as const,
        at: send.createdAt,
        messageId: send.messageId,
        threadId: send.threadId,
        subject: send.message.subject,
        status: send.status,
        recipient: send.recipient,
        details: send.details,
      })),
      ...executions.map((execution) => {
        const results = execution.results as { status?: string }[];
        return {
          kind: 'RULE' as const,
          at: execution.createdAt,
          messageId: execution.messageId,
          threadId: execution.message.threadId,
          subject: execution.message.subject,
          status: results.every((result) => result.status === 'done')
            ? 'done'
            : results.some((result) => result.status === 'failed')
              ? 'failed'
              : 'partial',
          ruleId: execution.ruleId,
          ruleName: execution.ruleName,
          results: execution.results,
          durationMs: execution.durationMs,
        };
      }),
    ];

    return entries
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit);
  }

  private async cancelScheduled(
    draftMessageId: string,
    originalMessageId: string,
  ): Promise<void> {
    await this.prisma.automationEffect.updateMany({
      where: {
        messageId: originalMessageId,
        kind: 'SEND',
        // Never PENDING: that one may have gone out.
        status: 'SCHEDULED',
      },
      data: { status: 'CANCELLED' },
    });
    await this.prisma.emailMessage.updateMany({
      where: { id: draftMessageId },
      data: { scheduledSendAt: null },
    });
  }

  private async notify(
    userId: string,
    title: string,
    body: string,
    draft: { id: string; inReplyToMessageId: string | null },
  ): Promise<void> {
    await this.notificationService
      .create(userId, title, body, {
        messageId: draft.inReplyToMessageId,
        draftId: draft.id,
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to create "${title}" notification: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        );
      });
  }
}
