import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../database';
// Leaf-file import — see documents.controller.ts's comment for why
// (avoids a Jest-only circular require).
import { EmailAccountService } from '../../email-account/services/email-account.service';

export interface ContactInput {
  email: string;
  name?: string;
  company?: string;
  phone?: string;
  notes?: string;
  tags?: string[];
  status?: string;
}

/**
 * CRM v1 (see docs/enterprise-ai-pipeline-plan.md §4) — structured contact
 * records. Member-accessible (not owner-only like AgentService/
 * WorkflowRuleService): contacts are shared operational data, same tier
 * as ThreadNote, not account configuration.
 */
@Injectable()
export class ContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailAccountService: EmailAccountService,
  ) {}

  async listForAccount(userId: string, accountId: string) {
    await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      accountId,
    );

    return this.prisma.contact.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, accountId: string, data: ContactInput) {
    await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      accountId,
    );

    const existing = await this.prisma.contact.findUnique({
      where: { accountId_email: { accountId, email: data.email } },
    });

    if (existing) {
      throw new ConflictException(
        'A contact with this email already exists on this account',
      );
    }

    return this.prisma.contact.create({
      data: {
        accountId,
        email: data.email,
        name: data.name,
        company: data.company,
        phone: data.phone,
        notes: data.notes,
        tags: data.tags ?? [],
        status: data.status,
      },
    });
  }

  async update(
    userId: string,
    accountId: string,
    contactId: string,
    data: Partial<Omit<ContactInput, 'email'>>,
  ) {
    await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      accountId,
    );

    // updateMany scoped by { id, accountId } avoids a check-then-update
    // race and never throws for a contact on someone else's account — it
    // just matches zero rows, reported as 404 (same pattern used
    // throughout this codebase, e.g. AgentService.update).
    const { count } = await this.prisma.contact.updateMany({
      where: { id: contactId, accountId },
      data,
    });

    if (count === 0) {
      throw new NotFoundException('Contact not found');
    }

    return this.prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
  }

  async delete(
    userId: string,
    accountId: string,
    contactId: string,
  ): Promise<void> {
    await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      accountId,
    );
    await this.prisma.contact.deleteMany({
      where: { id: contactId, accountId },
    });
  }

  /**
   * Called by AiProcessingProcessor for every processed message — updates
   * lastContactedAt on an EXISTING contact matching the sender's email.
   * Never creates a contact: that's always an explicit user action (see
   * this model's schema comment for why). No ownership check — runs from
   * the background AI pipeline, not a user request; scoping by accountId
   * is enough to prevent cross-account leakage, matching
   * AgentService.getEnabledSystemPrompt's pattern.
   */
  async touchLastContacted(accountId: string, email: string): Promise<void> {
    await this.prisma.contact.updateMany({
      where: { accountId, email },
      data: { lastContactedAt: new Date() },
    });
  }

  /**
   * Read-only lookup for AiProcessingProcessor's reply-context enrichment
   * (multi-agent orchestration §A — see docs/multi-agent-orchestration-plan.md):
   * if the sender is a known Contact, the reply can be grounded in that
   * (status, company, notes) the same way contactMemory/RAG results
   * already are. Same no-ownership-check reasoning as
   * touchLastContacted — background pipeline, not a user request.
   */
  async findByEmail(accountId: string, email: string) {
    return this.prisma.contact.findUnique({
      where: { accountId_email: { accountId, email } },
    });
  }
}
