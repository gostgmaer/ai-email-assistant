import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

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

@Injectable()
export class ApprovalChainService {
  private readonly logger = new Logger(ApprovalChainService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailAccountService: EmailAccountService,
    private readonly notificationService: NotificationService,
    private readonly composeService: ComposeService,
  ) {}

  /** Called by AiProcessingProcessor once a REQUIRE_APPROVAL_CHAIN rule
   * matched and the gated reply has been saved as a draft. Only the first
   * step starts PENDING (actionable) — the rest start WAITING until their
   * predecessor is approved, see the schema comment on ApprovalStep. */
  async create(
    accountId: string,
    draftMessageId: string,
    approverUserIds: string[],
  ) {
    const chain = await this.prisma.approvalChain.create({
      data: {
        accountId,
        draftMessageId,
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
        draftSubject: chain.draftMessage.subject,
        stepOrder: firstStep.order,
        totalSteps: chain.steps.length,
        draftMessageId: chain.draftMessageId,
      });
    }

    return chain;
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

    await this.prisma.approvalStep.update({
      where: { id: currentStep.id },
      data: { status: decision, comment, decidedAt: new Date() },
    });

    if (decision === 'REJECTED') {
      await this.prisma.approvalChain.update({
        where: { id: chainId },
        data: { status: 'REJECTED' },
      });

      await this.notifyChainRejected({
        ownerUserId: chain.account.userId,
        draftSubject: chain.draftMessage.subject,
        comment,
        draftMessageId: chain.draftMessageId,
      });
    } else {
      const nextStep = chain.steps.find(
        (step) => step.order === currentStep.order + 1,
      );

      if (nextStep) {
        await this.prisma.approvalStep.update({
          where: { id: nextStep.id },
          data: { status: 'PENDING' },
        });

        await this.notifyApprover({
          approverUserId: nextStep.approverUserId,
          draftSubject: chain.draftMessage.subject,
          stepOrder: nextStep.order,
          totalSteps: chain.steps.length,
          draftMessageId: chain.draftMessageId,
        });
      } else {
        await this.prisma.approvalChain.update({
          where: { id: chainId },
          data: { status: 'APPROVED' },
        });

        // sendApprovedDraft (on success) sends the draft, which deletes the
        // draft's EmailThread — cascading through EmailMessage to this very
        // ApprovalChain row (FK on draftMessageId). The re-fetch below would
        // then throw NotFoundException even though the approval + send both
        // genuinely succeeded, so return a reconstructed snapshot instead of
        // querying a row that may no longer exist.
        await this.sendApprovedDraft({
          ownerUserId: chain.account.userId,
          draftMessageId: chain.draftMessageId,
          draftSubject: chain.draftMessage.subject,
        });

        return {
          ...chain,
          status: 'APPROVED' as const,
          steps: chain.steps.map((step) =>
            step.id === currentStep.id
              ? { ...step, status: decision, comment, decidedAt: new Date() }
              : step,
          ),
        };
      }
    }

    return this.prisma.approvalChain.findUniqueOrThrow({
      where: { id: chainId },
      include: CHAIN_INCLUDE,
    });
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
      );
    } catch (error) {
      this.logger.warn(
        `Failed to notify approver ${params.approverUserId} for draft ${params.draftMessageId}: ${String(error)}`,
      );
    }
  }

  private async notifyChainRejected(params: {
    ownerUserId: string;
    draftSubject: string | null;
    comment?: string;
    draftMessageId: string;
  }): Promise<void> {
    try {
      await this.notificationService.create(
        params.ownerUserId,
        'An approval chain was rejected',
        `"${params.draftSubject ?? '(no subject)'}" was rejected${params.comment ? `: ${params.comment}` : '.'} — the draft is still in Drafts for you to rework.`,
        { draftMessageId: params.draftMessageId },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to notify account owner of rejection for draft ${params.draftMessageId}: ${String(error)}`,
      );
    }
  }

  private async sendApprovedDraft(params: {
    ownerUserId: string;
    draftMessageId: string;
    draftSubject: string | null;
  }): Promise<void> {
    try {
      await this.composeService.sendDraft(
        params.ownerUserId,
        params.draftMessageId,
      );
      await this.notificationService.create(
        params.ownerUserId,
        'Approval chain complete — reply sent',
        `"${params.draftSubject ?? '(no subject)'}" was approved by everyone and has been sent.`,
      );
    } catch (error) {
      this.logger.warn(
        `Draft ${params.draftMessageId} was fully approved but failed to send automatically — it can still be sent manually: ${String(error)}`,
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
