import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';

import { PrismaService } from '../../../database';
import { AIJobs, QueueNames } from '../../../infrastructure/queue';
// Leaf-file import rather than the '../../calendar' barrel — see the
// comment in meeting-scheduling.service.ts for why (avoids a Jest-only
// circular require through calendar.module.ts <-> ai.module.ts).
import { MeetingSchedulingService } from '../../calendar/services/meeting-scheduling.service';
import {
  DocumentChunkMatch,
  DocumentsService,
} from '../../documents/services/documents.service';
import { isAutomatedAddress } from '../../email/providers/bulk-mail.util';
import { NormalizedParticipant } from '../../email/interfaces';
import {
  ComposeService,
  GenerationMetadata,
} from '../../email/services/compose.service';
import { TasksService } from '../../tasks';
// Leaf-file import rather than the '../../workflow' barrel — see the
// comment above on MeetingSchedulingService for why.
import { WorkflowRuleService } from '../../workflow/services/workflow-rule.service';
import { EmailMessageDto } from '../dto';
import {
  AiClientService,
  ClassificationResult,
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
    private readonly tasksService: TasksService,
    @Inject(forwardRef(() => DocumentsService))
    private readonly documentsService: DocumentsService,
    @Inject(forwardRef(() => MeetingSchedulingService))
    private readonly meetingSchedulingService: MeetingSchedulingService,
    @Inject(forwardRef(() => WorkflowRuleService))
    private readonly workflowRuleService: WorkflowRuleService,
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

    // Persisted regardless of the spam branch below — the classification
    // was already paid for, and Priority Inbox wants a record of it even
    // for messages that get skipped past this point (see
    // docs/v1.2-plan.md's "Priority Inbox" section, previously discarded).
    await this.persistClassification(messageId, classification);

    if (classification.spam) {
      this.logger.log(`Message ${messageId} classified as spam, skipping.`);
      await this.markProcessed(messageId);
      return;
    }

    // Best-effort, non-blocking: a failed/slow extraction call must never
    // stop the reply from being generated. Not awaited alongside the
    // pipeline below on purpose — kicked off here so it runs concurrently
    // with contactMemory/reply generation rather than adding to the
    // critical path.
    const extractionPromise = this.extractTasks(
      account.userId,
      messageId,
      message.threadId,
      subject,
      thread,
      account.autoScheduleMeetings,
    );

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

    const { instruction, contactMemoryUsed } = buildContextInstruction(
      related,
      contactMemory,
      documentMatches,
    );

    const reply = await this.aiClientService.generateReply(
      subject,
      thread,
      instruction,
    );

    const generationMetadata: GenerationMetadata = {
      ragUsed: documentMatches.length > 0,
      contactMemoryUsed,
      provider: reply.provider,
      model: reply.model,
      usage: reply.usage,
      documents: documentMatches.map((match: DocumentChunkMatch) => ({
        documentId: match.documentId,
        chunkId: match.id,
        filename: match.filename,
        distance: match.distance,
      })),
    };

    // Workflow Builder (v2.0 §3): the account's WorkflowRule rows decide
    // whether this reply auto-sends (and any other actions — assign,
    // notify). No matching rule falls through to the existing default:
    // draft for review.
    const matchedActions = await this.workflowRuleService.evaluate(account.id, {
      category: classification.category,
      priority: classification.priority,
      sender: sender.address,
    });

    let isSafeToAutoSend = false;
    if (matchedActions) {
      const { autoReply } = await this.workflowRuleService.executeActions(
        matchedActions,
        { accountId: account.id, threadId: message.threadId, messageId },
      );
      // Hard safety rail, not rule-overridable: classify.md's prompt
      // returns "Urgent" (capitalized) — matched case-insensitively here.
      // A past bug compared against lowercase 'urgent' directly and so
      // never actually excluded urgent messages from auto-send; keeping
      // the same guarantee even though the decision now otherwise comes
      // from rules.
      isSafeToAutoSend =
        autoReply && classification.priority.toLowerCase() !== 'urgent';
    }

    if (isSafeToAutoSend) {
      await this.composeService.reply(
        account.userId,
        {
          messageId,
          bodyHtml: `<p>${reply.reply.replace(/\n/g, '<br />')}</p>`,
          bodyText: reply.reply,
        },
        generationMetadata,
      );
      this.logger.log(
        `Auto-sent a reply to message ${messageId} (category: ${classification.category}, ragUsed: ${generationMetadata.ragUsed}).`,
      );
    } else {
      await this.composeService.saveDraftReply(
        account.userId,
        messageId,
        {
          subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
          bodyText: reply.reply,
        },
        generationMetadata,
      );
      this.logger.log(
        `Drafted a reply to message ${messageId} for review (category: ${classification.category}, ragUsed: ${generationMetadata.ragUsed}).`,
      );
    }

    // Awaited here (not earlier) so it runs concurrently with the reply
    // pipeline above rather than serially in front of it, while still
    // guaranteeing it finishes before the job is marked complete.
    await extractionPromise;

    await this.markProcessed(messageId);
  }

  private async persistClassification(
    messageId: string,
    classification: ClassificationResult,
  ): Promise<void> {
    await this.prisma.emailMessage.update({
      where: { id: messageId },
      data: {
        category: classification.category,
        priority: classification.priority,
        sentiment: classification.sentiment,
        isSpam: classification.spam,
      },
    });
  }

  private async extractTasks(
    userId: string,
    messageId: string,
    threadId: string,
    subject: string,
    thread: EmailMessageDto[],
    autoScheduleMeetings: boolean,
  ): Promise<void> {
    try {
      const { extraction } = await this.aiClientService.extract(
        subject,
        thread,
      );
      const created = await this.tasksService.createFromExtraction(
        userId,
        messageId,
        threadId,
        extraction,
      );

      if (!autoScheduleMeetings) {
        return;
      }

      // Opt-in, off by default (EmailAccount.autoScheduleMeetings). Each
      // meeting request is scheduled independently and best-effort —
      // autoSchedule() already swallows its own errors, so one failure
      // doesn't block the others.
      const meetingRequests = created.filter(
        (task) => task.type === 'MEETING_REQUEST',
      );
      await Promise.all(
        meetingRequests.map((task) =>
          this.meetingSchedulingService.autoSchedule(userId, task.id),
        ),
      );
    } catch (error) {
      this.logger.warn(
        `Task extraction failed for message ${messageId}, continuing without it: ${String(error)}`,
      );
    }
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
): { instruction: string | undefined; contactMemoryUsed: boolean } {
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

  return {
    instruction: sections.length > 0 ? sections.join('\n\n') : undefined,
    contactMemoryUsed: priorContacts.length > 0,
  };
}
