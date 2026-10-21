import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../database';
// Leaf-file imports — see documents.controller.ts's comment for why
// (avoids a Jest-only circular require).
import { EmailAccountService } from '../../email-account/services/email-account.service';
import { ComposeService } from '../../email/services/compose.service';
import { NotificationService } from '../../notification/services/notification.service';

const APPROVER_SELECT = {
  select: { id: true, email: true, displayName: true },
} as const;

const STEP_INCLUDE = {
  orderBy: { order: 'asc' as const },
  include: { approver: APPROVER_SELECT },
};

const DRAFT_SELECT = {
  select: {
    id: true,
    subject: true,
    bodyText: true,
    to: true,
    threadId: true,
  },
} as const;

const ACCOUNT_SELECT = {
  select: { id: true, email: true, userId: true },
} as const;

const CHAIN_INCLUDE = {
  steps: STEP_INCLUDE,
  draftMessage: DRAFT_SELECT,
  account: ACCOUNT_SELECT,
};

const DEFAULT_TTL_HOURS = 72;
const MAX_TTL_HOURS = 30 * 24;

@Injectable()
export class ApprovalChainService {
  private readonly logger = new Logger(ApprovalChainService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailAccountService: EmailAccountService,
    private readonly notificationService: NotificationService,
    private readonly composeService: ComposeService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Called by AiProcessingProcessor once a REQUIRE_APPROVAL_CHAIN rule
   * matched and the gated reply has been saved as a draft. Only the first
   * step starts PENDING (actionable) — the rest start WAITING until their
   * predecessor is approved, see the schema comment on ApprovalStep.
   *
   * Every approver must have access to the account: an approver sees the
   * draft (and so the conversation it answers), which must never extend to
   * someone who isn't a member. The draft's subject/recipients are
   * snapshotted onto the chain so the audit record survives the draft.
   */
  async create(
    accountId: string,
    draftMessageId: string,
    approverUserIds: string[],
    options: { expiresInHours?: number } = {},
  ) {
    await this.assertApproversHaveAccess(accountId, approverUserIds);

    const draft = await this.prisma.emailMessage.findUniqueOrThrow({
      where: { id: draftMessageId },
      select: { subject: true, to: true },
    });

    const chain = await this.prisma.approvalChain.create({
      data: {
        accountId,
        draftMessageId,
        draftSubject: draft.subject,
        draftRecipients: draft.to ?? [],
        expiresAt: new Date(
          Date.now() + this.ttlHours(options.expiresInHours) * 60 * 60 * 1000,
        ),
        steps: {
          create: approverUserIds.map((approverUserId, index) => ({
            order: index,
            approverUserId,
            status: index === 0 ? 'PENDING' : 'WAITING',
          })),
        },
      },
      include: CHAIN_INCLUDE,
    });

    const firstStep = chain.steps[0];
    if (firstStep) {
      await this.notifyApprover({
        approverUserId: firstStep.approverUserId,
        draftSubject: chain.draftSubject,
        stepOrder: firstStep.order,
        totalSteps: chain.steps.length,
        draftMessageId,
      });
    }

    return chain;
  }

  /** Rejects approver lists that include anyone without access to the
   * account. Also used when a rule is saved (WorkflowRuleService), so a bad
   * approver is caught then rather than when mail arrives. */
  async assertApproversHaveAccess(
    accountId: string,
    approverUserIds: string[],
  ): Promise<void> {
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

  async getForDraft(userId: string, draftMessageId: string) {
    const chain = await this.prisma.approvalChain.findUnique({
      where: { draftMessageId },
      include: CHAIN_INCLUDE,
    });

    if (!chain) {
      return null;
    }

    await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      chain.accountId,
    );

    return chain;
  }

  /** Chains where it's currently this user's turn to act, across every
   * account they're a member of — the approver's "queue". */
  async listPendingForUser(userId: string) {
    return this.prisma.approvalChain.findMany({
      where: {
        status: 'PENDING',
        draftMessageId: { not: null },
        steps: { some: { approverUserId: userId, status: 'PENDING' } },
      },
      include: CHAIN_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  async approve(userId: string, chainId: string, comment?: string) {
    return this.decide(userId, chainId, 'APPROVED', comment);
  }

  async reject(userId: string, chainId: string, comment?: string) {
    return this.decide(userId, chainId, 'REJECTED', comment);
  }

  /**
   * Records one approver's decision. The state change is atomic: each
   * write is conditional on the state this decision was based on (step
   * still PENDING, chain still PENDING) inside one transaction, so two
   * concurrent decisions — a double-click, or approve and reject racing —
   * can't both apply; the loser gets a 409 instead of corrupting the chain.
   */
  private async decide(
    userId: string,
    chainId: string,
    decision: 'APPROVED' | 'REJECTED',
    comment?: string,
  ) {
    const chain = await this.prisma.approvalChain.findUnique({
      where: { id: chainId },
      include: CHAIN_INCLUDE,
    });

    if (!chain) {
      throw new NotFoundException('Approval chain not found');
    }

    if (chain.status !== 'PENDING') {
      throw new BadRequestException(
        'This approval chain has already been resolved',
      );
    }

    if (!chain.draftMessageId) {
      throw new BadRequestException(
        'The draft this approval chain was gating no longer exists',
      );
    }

    const currentStep = chain.steps.find((step) => step.status === 'PENDING');
    if (!currentStep) {
      throw new BadRequestException(
        'This approval chain has already been resolved',
      );
    }

    if (currentStep.approverUserId !== userId) {
      throw new ForbiddenException(
        "It isn't your turn to decide on this approval chain",
      );
    }

    const nextStep =
      decision === 'APPROVED'
        ? chain.steps.find((step) => step.order === currentStep.order + 1)
        : undefined;
    const chainStatus =
      decision === 'REJECTED' ? 'REJECTED' : nextStep ? null : 'APPROVED';
    const decidedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      const stepUpdate = await tx.approvalStep.updateMany({
        where: { id: currentStep.id, status: 'PENDING' },
        data: { status: decision, comment, decidedAt },
      });
      const chainStillPending = await tx.approvalChain.count({
        where: { id: chainId, status: 'PENDING' },
      });

      if (stepUpdate.count !== 1 || chainStillPending !== 1) {
        throw new ConflictException(
          'This approval chain changed while you were deciding — reload and try again',
        );
      }

      if (nextStep) {
        await tx.approvalStep.update({
          where: { id: nextStep.id },
          data: { status: 'PENDING' },
        });
      }

      if (chainStatus) {
        await tx.approvalChain.update({
          where: { id: chainId },
          data: { status: chainStatus },
        });
      }
    });

    if (decision === 'REJECTED') {
      await this.notifyOwner(
        chain.account.userId,
        'An approval chain was rejected',
        `"${chain.draftSubject ?? '(no subject)'}" was rejected${comment ? `: ${comment}` : '.'} — the draft is still in Drafts for you to rework.`,
        chain.draftMessageId,
      );
    } else if (nextStep) {
      await this.notifyApprover({
        approverUserId: nextStep.approverUserId,
        draftSubject: chain.draftSubject,
        stepOrder: nextStep.order,
        totalSteps: chain.steps.length,
        draftMessageId: chain.draftMessageId,
      });
    } else {
      await this.sendApprovedDraft({
        chainId,
        ownerUserId: chain.account.userId,
        draftMessageId: chain.draftMessageId,
        draftSubject: chain.draftSubject,
      });
    }

    // Sending deletes the draft, but the chain row survives (SetNull), so
    // the re-fetch reflects the final state either way.
    return this.prisma.approvalChain.findUniqueOrThrow({
      where: { id: chainId },
      include: CHAIN_INCLUDE,
    });
  }

  /**
   * Periodic (see ApprovalSweepProcessor): reminds the current approver
   * once, halfway to the deadline, and expires chains nobody finished in
   * time. An expired chain no longer blocks the draft — the owner can send
   * or rework it manually, same as after a rejection.
   */
  async sweep(
    now = new Date(),
  ): Promise<{ reminded: number; expired: number }> {
    const due = await this.prisma.approvalChain.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { not: null },
        OR: [{ reminderSentAt: null }, { expiresAt: { lte: now } }],
      },
      include: CHAIN_INCLUDE,
    });

    let reminded = 0;
    let expired = 0;

    for (const chain of due) {
      const expiresAt = chain.expiresAt;

      if (expiresAt <= now) {
        // Conditional: a decision landing at the same moment wins.
        const result = await this.prisma.approvalChain.updateMany({
          where: { id: chain.id, status: 'PENDING' },
          data: { status: 'EXPIRED' },
        });
        if (result.count === 1) {
          expired++;
          await this.notifyOwner(
            chain.account.userId,
            'An approval chain expired',
            `Nobody finished approving "${chain.draftSubject ?? '(no subject)'}" in time. The draft is still in Drafts — send or rework it yourself.`,
            chain.draftMessageId,
          );
        }
        continue;
      }

      const halfway =
        chain.createdAt.getTime() +
        (expiresAt.getTime() - chain.createdAt.getTime()) / 2;
      const currentStep = chain.steps.find((s) => s.status === 'PENDING');

      if (!chain.reminderSentAt && now.getTime() >= halfway && currentStep) {
        const result = await this.prisma.approvalChain.updateMany({
          where: { id: chain.id, status: 'PENDING', reminderSentAt: null },
          data: { reminderSentAt: now },
        });
        if (result.count === 1) {
          reminded++;
          await this.notificationService
            .create(
              currentStep.approverUserId,
              'Reminder: your approval is needed',
              `"${chain.draftSubject ?? '(no subject)'}" is still waiting for your sign-off and expires ${expiresAt.toISOString()}.`,
              { draftMessageId: chain.draftMessageId },
              'APPROVAL_REQUESTED',
            )
            .catch((error: unknown) => {
              this.logger.warn(
                `Failed to send approval reminder for chain ${chain.id}: ${describeError(error)}`,
              );
            });
        }
      }
    }

    return { reminded, expired };
  }

  private ttlHours(requested?: number): number {
    const configured = Number(
      this.configService.get<string>('APPROVAL_CHAIN_TTL_HOURS') ??
        DEFAULT_TTL_HOURS,
    );
    const hours = requested ?? configured;
    return Number.isFinite(hours) && hours > 0
      ? Math.min(hours, MAX_TTL_HOURS)
      : DEFAULT_TTL_HOURS;
  }

  private async notifyApprover(params: {
    approverUserId: string;
    draftSubject: string | null;
    stepOrder: number;
    totalSteps: number;
    draftMessageId: string;
  }): Promise<void> {
    try {
      await this.notificationService.create(
        params.approverUserId,
        'Your approval is needed',
        `"${params.draftSubject ?? '(no subject)'}" needs your sign-off (step ${params.stepOrder + 1} of ${params.totalSteps}).`,
        { draftMessageId: params.draftMessageId },
        'APPROVAL_REQUESTED',
      );
    } catch (error) {
      this.logger.warn(
        `Failed to notify approver ${params.approverUserId} for draft ${params.draftMessageId}: ${describeError(error)}`,
      );
    }
  }

  private async notifyOwner(
    ownerUserId: string,
    title: string,
    body: string,
    draftMessageId: string | null,
  ): Promise<void> {
    try {
      await this.notificationService.create(ownerUserId, title, body, {
        draftMessageId,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to notify account owner (${title}) for draft ${draftMessageId}: ${describeError(error)}`,
      );
    }
  }

  private async sendApprovedDraft(params: {
    chainId: string;
    ownerUserId: string;
    draftMessageId: string;
    draftSubject: string | null;
  }): Promise<void> {
    try {
      const sent = await this.composeService.sendDraft(
        params.ownerUserId,
        params.draftMessageId,
      );
      // The audit trail: which message the approved draft went out as.
      await this.prisma.approvalChain.update({
        where: { id: params.chainId },
        data: { sentMessageId: sent.providerMessageId },
      });
      await this.notificationService.create(
        params.ownerUserId,
        'Approval chain complete — reply sent',
        `"${params.draftSubject ?? '(no subject)'}" was approved by everyone and has been sent.`,
      );
    } catch (error) {
      this.logger.warn(
        `Draft ${params.draftMessageId} was fully approved but failed to send automatically — it can still be sent manually: ${describeError(error)}`,
      );
      await this.notificationService
        .create(
          params.ownerUserId,
          'Approved reply failed to send automatically',
          `"${params.draftSubject ?? '(no subject)'}" was approved by everyone but the automatic send failed. Open it in Drafts and send it manually.`,
        )
        .catch(() => undefined);
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : JSON.stringify(error);
}
