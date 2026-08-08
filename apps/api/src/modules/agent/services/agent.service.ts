import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../database';
// Leaf-file import — see documents.controller.ts's comment for why
// (avoids a Jest-only circular require).
import { EmailAccountService } from '../../email-account/services/email-account.service';

export interface AgentInput {
  name: string;
  systemPrompt: string;
  enabled?: boolean;
}

/**
 * AI Agents (v2.0 §4) — CRUD for named reply personas. Owner-only, same
 * tier as WorkflowRuleService (account configuration, not a Shared Inbox
 * member-accessible resource).
 */
@Injectable()
export class AgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailAccountService: EmailAccountService,
  ) {}

  async listForAccount(userId: string, accountId: string) {
    await this.emailAccountService.getOwnedAccountOrThrow(userId, accountId);

    return this.prisma.agent.findMany({
      where: { accountId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: string, accountId: string, data: AgentInput) {
    await this.emailAccountService.getOwnedAccountOrThrow(userId, accountId);

    return this.prisma.agent.create({
      data: {
        accountId,
        name: data.name,
        systemPrompt: data.systemPrompt,
        enabled: data.enabled ?? true,
      },
    });
  }

  async update(
    userId: string,
    accountId: string,
    agentId: string,
    data: Partial<AgentInput>,
  ) {
    await this.emailAccountService.getOwnedAccountOrThrow(userId, accountId);

    // updateMany scoped by { id, accountId } avoids a check-then-update
    // race and never throws for an agent on someone else's account — it
    // just matches zero rows, reported as 404 (same pattern used
    // throughout this codebase, e.g. WorkflowRuleService.update).
    const { count } = await this.prisma.agent.updateMany({
      where: { id: agentId, accountId },
      data,
    });

    if (count === 0) {
      throw new NotFoundException('Agent not found');
    }

    return this.prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
  }

  async delete(
    userId: string,
    accountId: string,
    agentId: string,
  ): Promise<void> {
    await this.emailAccountService.getOwnedAccountOrThrow(userId, accountId);
    await this.prisma.agent.deleteMany({ where: { id: agentId, accountId } });
  }

  /** Used by WorkflowRuleService/AiProcessingProcessor when a matched
   * rule's AUTO_REPLY action carries an agentId — no ownership check here
   * since this runs from the background AI pipeline, not a user request;
   * scoping by accountId is enough to prevent cross-account leakage. */
  async getEnabledSystemPrompt(
    accountId: string,
    agentId: string,
  ): Promise<string | null> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent || agent.accountId !== accountId || !agent.enabled) {
      return null;
    }

    return agent.systemPrompt;
  }
}
