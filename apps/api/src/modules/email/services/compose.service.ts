import { randomUUID } from 'crypto';

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../database';
import type { InputJsonValue } from '../../../generated/prisma/internal/prismaNamespace';
import { EmailAccountService } from '../../email-account';
import {
  ComposeEmailDto,
  CreateDraftDto,
  ReplyEmailDto,
  SaveDraftDto,
} from '../dto';
import { NormalizedParticipant } from '../interfaces';
import { MailProviderFactory } from '../providers/mail-provider.factory';
import { InboxService } from './inbox.service';

/** Provenance of an AI-generated reply — set only by the autonomous
 * pipeline, never by manual compose/send. */
export interface GenerationMetadata {
  ragUsed: boolean;
  contactMemoryUsed: boolean;
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  documents: Array<{
    documentId: string;
    chunkId: string;
    filename: string;
    distance: number;
  }>;
}

@Injectable()
export class ComposeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailAccountService: EmailAccountService,
    private readonly mailProviderFactory: MailProviderFactory,
    private readonly inboxService: InboxService,
  ) {}

  async send(userId: string, dto: ComposeEmailDto) {
    const account = await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      dto.accountId,
    );

    const client = await this.mailProviderFactory.createClient(account);

    const result = await client.sendMessage({
      to: dto.to,
      cc: dto.cc,
      bcc: dto.bcc,
      subject: dto.subject,
      bodyHtml: dto.bodyHtml,
      bodyText: dto.bodyText,
    });

    return this.persistSentMessage(
      account.id,
      dto,
      result,
      dto.to,
      dto.cc,
      dto.bcc,
    );
  }

  async reply(
    userId: string,
    dto: ReplyEmailDto,
    generationMetadata?: GenerationMetadata,
  ) {
    const original = await this.inboxService.getMessageOwned(
      userId,
      dto.messageId,
    );
    const account = original.thread.account;

    // getMessageOwned() above already verified access — this second
    // lookup just needs the full EmailAccount row (only id/provider/
    // userId were selected there), not another permission check.
    const fullAccount =
      await this.emailAccountService.getAccessibleAccountOrThrow(
        userId,
        account.id,
      );

    const client = await this.mailProviderFactory.createClient(fullAccount);

    const to = original.from as unknown as NormalizedParticipant[];

    const result = await client.sendMessage({
      to,
      subject: original.subject
        ? `Re: ${original.subject.replace(/^Re:\s*/i, '')}`
        : 'Re:',
      bodyHtml: dto.bodyHtml,
      bodyText: dto.bodyText,
      inReplyToProviderMessageId: original.providerMessageId,
      providerThreadId: original.thread.providerThreadId,
    });

    return this.persistSentMessage(
      fullAccount.id,
      {
        subject: original.subject ?? 'Re:',
        bodyHtml: dto.bodyHtml,
        bodyText: dto.bodyText,
      },
      result,
      to,
      undefined,
      undefined,
      generationMetadata,
    );
  }

  /**
   * Used by the autonomous AI pipeline to hold a drafted reply for human
   * review instead of sending it. Reuses the same local-Drafts mechanism as
   * saveDraft() (so it shows up in the existing Drafts tab), but threads it
   * to the message being replied to via inReplyToMessageId.
   */
  async saveDraftReply(
    userId: string,
    originalMessageId: string,
    content: { subject: string; bodyText: string },
    generationMetadata?: GenerationMetadata,
  ) {
    const original = await this.inboxService.getMessageOwned(
      userId,
      originalMessageId,
    );
    const account = original.thread.account;

    const to = original.from as unknown as NormalizedParticipant[];

    const folder = await this.findOrCreateLocalFolder(
      account.id,
      'DRAFTS',
      'Drafts',
    );

    const thread = await this.prisma.emailThread.create({
      data: {
        accountId: account.id,
        folderId: folder.id,
        providerThreadId: `local-draft-${randomUUID()}`,
        subject: content.subject,
        snippet: content.bodyText.slice(0, 200),
        lastMessageAt: new Date(),
      },
    });

    return this.prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        providerMessageId: `local-draft-${randomUUID()}`,
        from: [],
        to: to as unknown as InputJsonValue,
        cc: [],
        bcc: [],
        subject: content.subject,
        bodyHtml: `<p>${content.bodyText.replace(/\n/g, '<br />')}</p>`,
        bodyText: content.bodyText,
        receivedAt: new Date(),
        isRead: true,
        inReplyToMessageId: originalMessageId,
        generationMetadata: generationMetadata as unknown as InputJsonValue,
      },
    });
  }

  async saveDraft(userId: string, dto: CreateDraftDto) {
    const account = await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      dto.accountId,
    );

    const folder = await this.findOrCreateLocalFolder(
      account.id,
      'DRAFTS',
      'Drafts',
    );

    const thread = await this.prisma.emailThread.create({
      data: {
        accountId: account.id,
        folderId: folder.id,
        providerThreadId: `local-draft-${randomUUID()}`,
        subject: dto.subject,
        snippet: dto.bodyText?.slice(0, 200) ?? dto.bodyHtml?.slice(0, 200),
        lastMessageAt: new Date(),
      },
    });

    return this.prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        providerMessageId: `local-draft-${randomUUID()}`,
        from: [],
        to: (dto.to ?? []) as unknown as InputJsonValue,
        cc: (dto.cc ?? []) as unknown as InputJsonValue,
        bcc: (dto.bcc ?? []) as unknown as InputJsonValue,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        bodyText: dto.bodyText,
        receivedAt: new Date(),
        isRead: true,
      },
    });
  }

  async updateDraft(userId: string, draftMessageId: string, dto: SaveDraftDto) {
    const draft = await this.getOwnedDraft(userId, draftMessageId);

    await this.prisma.emailThread.update({
      where: { id: draft.threadId },
      data: {
        subject: dto.subject ?? draft.subject,
        snippet: dto.bodyText?.slice(0, 200) ?? dto.bodyHtml?.slice(0, 200),
      },
    });

    return this.prisma.emailMessage.update({
      where: { id: draftMessageId },
      data: {
        to: dto.to ? (dto.to as unknown as InputJsonValue) : undefined,
        cc: dto.cc ? (dto.cc as unknown as InputJsonValue) : undefined,
        bcc: dto.bcc ? (dto.bcc as unknown as InputJsonValue) : undefined,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        bodyText: dto.bodyText,
      },
    });
  }

  async sendDraft(userId: string, draftMessageId: string) {
    const draft = await this.getOwnedDraft(userId, draftMessageId);
    const account = draft.thread.folder.account;

    if (!draft.subject || !draft.bodyHtml || !(draft.to as unknown[]).length) {
      throw new ForbiddenException(
        'Draft is missing required fields (to, subject, bodyHtml)',
      );
    }

    const sent = await this.send(userId, {
      accountId: account.id,
      to: draft.to as unknown as NormalizedParticipant[],
      cc: draft.cc as unknown as NormalizedParticipant[] | undefined,
      bcc: draft.bcc as unknown as NormalizedParticipant[] | undefined,
      subject: draft.subject,
      bodyHtml: draft.bodyHtml,
      bodyText: draft.bodyText ?? undefined,
    });

    await this.prisma.emailThread.delete({ where: { id: draft.threadId } });

    return sent;
  }

  async deleteDraft(userId: string, draftMessageId: string): Promise<void> {
    const draft = await this.getOwnedDraft(userId, draftMessageId);
    await this.prisma.emailThread.delete({ where: { id: draft.threadId } });
  }

  private async getOwnedDraft(userId: string, draftMessageId: string) {
    const message = await this.prisma.emailMessage.findUnique({
      where: { id: draftMessageId },
      include: {
        thread: { include: { folder: { include: { account: true } } } },
      },
    });

    if (!message || message.thread.folder.type !== 'DRAFTS') {
      throw new NotFoundException('Draft not found');
    }

    await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      message.thread.folder.account.id,
    );

    return message;
  }

  private async findOrCreateLocalFolder(
    accountId: string,
    type: 'SENT' | 'DRAFTS',
    name: string,
  ) {
    const existing = await this.prisma.mailFolder.findFirst({
      where: { accountId, type },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.mailFolder.create({
      data: { accountId, type, name, providerFolderId: null },
    });
  }

  private async persistSentMessage(
    accountId: string,
    content: { subject: string; bodyHtml: string; bodyText?: string },
    result: { providerMessageId: string; providerThreadId: string },
    to: NormalizedParticipant[],
    cc?: NormalizedParticipant[],
    bcc?: NormalizedParticipant[],
    generationMetadata?: GenerationMetadata,
  ) {
    const account = await this.prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
    });

    const folder = await this.findOrCreateLocalFolder(
      accountId,
      'SENT',
      'Sent',
    );

    const thread = await this.prisma.emailThread.upsert({
      where: {
        accountId_providerThreadId: {
          accountId,
          providerThreadId: result.providerThreadId,
        },
      },
      create: {
        accountId,
        folderId: folder.id,
        providerThreadId: result.providerThreadId,
        subject: content.subject,
        snippet: content.bodyText?.slice(0, 200),
        lastMessageAt: new Date(),
      },
      update: {
        subject: content.subject,
        snippet: content.bodyText?.slice(0, 200),
        lastMessageAt: new Date(),
      },
    });

    return this.prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        providerMessageId: result.providerMessageId,
        from: [{ address: account.email }],
        to: to as unknown as InputJsonValue,
        cc: (cc ?? []) as unknown as InputJsonValue,
        bcc: (bcc ?? []) as unknown as InputJsonValue,
        subject: content.subject,
        bodyHtml: content.bodyHtml,
        bodyText: content.bodyText,
        receivedAt: new Date(),
        isRead: true,
        generationMetadata: generationMetadata as unknown as InputJsonValue,
      },
    });
  }
}
