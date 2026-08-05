import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';

import { PrismaService } from '../../../database';
import { AIJobs, QueueNames } from '../../../infrastructure/queue';
import {
  DocumentChunkMatch,
  DocumentsService,
} from '../../documents/services/documents.service';
import { isAutomatedAddress } from '../../email/providers/bulk-mail.util';
import { NormalizedParticipant } from '../../email/interfaces';
import { ComposeService } from '../../email/services/compose.service';
import { EmailMessageDto } from '../dto';
import {
  AiClientService,
  ContactMemoryResponse,
} from '../services/ai-client.service';
import {
  ContactMemoryMatch,
  ContactMemoryService,
} from '../services/contact-memory.service';

interface AiProcessingJobData {
  messageId: string;
}

@Processor(QueueNames.AI)
export class AiProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClientService: AiClientService,
    private readonly contactMemoryService: ContactMemoryService,
    private readonly composeService: ComposeService,
    @Inject(forwardRef(() => DocumentsService))
    private readonly documentsService: DocumentsService,
  ) {
    super();
  }

  async process(job: Job<AiProcessingJobData>): Promise<void> {
    if (job.name !== AIJobs.ProcessMessage) {
      this.logger.warn(`Unknown AI job: ${job.name}`);
      return;
    }

    await this.processMessage(job.data.messageId);
  }

  private async processMessage(messageId: string): Promise<void> {
    const message = await this.prisma.emailMessage.findUnique({
      where: { id: messageId },
      include: {
        thread: {
          include: {
            account: true,
            messages: { orderBy: { receivedAt: 'asc' } },
          },
        },
      },
    });

    if (!message || message.aiProcessedAt) {
      return;
    }

    const account = message.thread.account;
    const sender = firstParticipant(message.from);

    if (!sender?.address) {
      // No usable sender to reply to or build a contact profile for.
      await this.markProcessed(messageId);
      return;
    }

    if (isAutomatedAddress(sender.address)) {
      // A reply here would go into a black hole (noreply/donotreply/alert
      // inbox) regardless of what the message is about — skip before
      // spending any AI calls on it, not just before sending.
      this.logger.log(
        `Message ${messageId} is from an automated address (${sender.address}), skipping.`,
      );
      await this.markProcessed(messageId);
      return;
    }

    const subject = message.thread.subject ?? message.subject ?? '(no subject)';
    const thread = message.thread.messages.map(toEmailMessageDto);

    const classifyResult = await this.aiClientService.classify(subject, thread);
    const classification = classifyResult.classification;

    if (classification.spam) {
      this.logger.log(`Message ${messageId} classified as spam, skipping.`);
      await this.markProcessed(messageId);
      return;
    }

    const contactMemory = await this.aiClientService.contactMemory(
      subject,
      thread,
    );

    await this.contactMemoryService.upsertMemory(
      account.userId,
      sender.address,
      sender.name ?? contactMemory.facts.company ?? sender.address,
      contactMemory.facts,
      contactMemory.embedding,
    );

    const related = await this.contactMemoryService.searchSimilar(
      account.userId,
      contactMemory.embedding,
      3,
    );

    // Best-effort: ground the reply in the user's own uploaded documents
    // (resumes, product docs, policies, etc.) — each user only ever
    // searches their own documents (DocumentsService.search scopes by
    // userId). A failure here (e.g. no documents yet) shouldn't block the
    // reply the way a contact-memory or classify failure would.
    const documentMatches = await this.documentsService
      .search(account.userId, message.bodyText ?? subject, 3)
      .catch(() => []);

    const reply = await this.aiClientService.generateReply(
      subject,
      thread,
      buildContextInstruction(related, contactMemory, documentMatches),
    );

    const isSafeToAutoSend =
      !classification.spam &&
      classification.priority !== 'urgent' &&
      account.autoSendCategories.includes(classification.category);

    if (isSafeToAutoSend) {
      await this.composeService.reply(account.userId, {
        messageId,
        bodyHtml: `<p>${reply.reply.replace(/\n/g, '<br />')}</p>`,
        bodyText: reply.reply,
      });
      this.logger.log(
        `Auto-sent a reply to message ${messageId} (category: ${classification.category}).`,
      );
    } else {
      await this.composeService.saveDraftReply(account.userId, messageId, {
        subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
        bodyText: reply.reply,
      });
      this.logger.log(
        `Drafted a reply to message ${messageId} for review (category: ${classification.category}).`,
      );
    }

    await this.markProcessed(messageId);
  }

  private async markProcessed(messageId: string): Promise<void> {
    await this.prisma.emailMessage.update({
      where: { id: messageId },
      data: { aiProcessedAt: new Date() },
    });
  }
}

function firstParticipant(from: unknown): NormalizedParticipant | undefined {
  const list = from as NormalizedParticipant[] | undefined;
  return Array.isArray(list) ? list[0] : undefined;
}

function toEmailMessageDto(message: {
  from: unknown;
  bodyText: string | null;
}): EmailMessageDto {
  const from = firstParticipant(message.from);

  return {
    name: from?.name ?? from?.address ?? 'Unknown',
    email: from?.address ?? 'unknown@example.com',
    content: message.bodyText ?? '',
  };
}

function buildContextInstruction(
  related: ContactMemoryMatch[],
  current: ContactMemoryResponse,
  documentMatches: DocumentChunkMatch[],
): string | undefined {
  const sections: string[] = [];

  const priorContacts = related.filter(
    (match) => match.facts.summary !== current.facts.summary,
  );

  if (priorContacts.length > 0) {
    const lines = priorContacts.map(
      (match) =>
        `- ${match.senderName ?? match.senderEmail}: ${match.facts.summary}`,
    );
    sections.push(
      `Known context about people involved in this conversation:\n${lines.join('\n')}`,
    );
  }

  if (documentMatches.length > 0) {
    const lines = documentMatches.map(
      (match) => `- (from "${match.filename}"): ${match.content}`,
    );
    sections.push(
      `Relevant information from the user's own uploaded documents — use this to answer specifics, but don't imply the recipient has access to these documents:\n${lines.join('\n\n')}`,
    );
  }

  return sections.length > 0 ? sections.join('\n\n') : undefined;
}
