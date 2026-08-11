import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';

import { PrismaService } from '../../../database';
import { ContactModel } from '../../../generated/prisma/models';
import { AIJobs, QueueNames } from '../../../infrastructure/queue';
// Leaf-file import rather than the '../../agent' barrel — see the
// comment below on WorkflowRuleService for why.
import { AgentService } from '../../agent/services/agent.service';
// Leaf-file import rather than the '../../approval' barrel — same
// reasoning as AgentService below.
import { ApprovalChainService } from '../../approval/services/approval-chain.service';
// Leaf-file import rather than the '../../calendar' barrel — see the
// comment in meeting-scheduling.service.ts for why (avoids a Jest-only
// circular require through calendar.module.ts <-> ai.module.ts).
import { MeetingSchedulingService } from '../../calendar/services/meeting-scheduling.service';
// Leaf-file import rather than the '../../crm' barrel — same reasoning as
// AgentService below.
import { ContactService } from '../../crm/services/contact.service';
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
// Leaf-file import rather than the '../../notification' barrel — same
// reasoning as AgentService above.
import { NotificationService } from '../../notification/services/notification.service';
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
import { scanOutputForPii } from '../utils/output-pii-scan.util';
import { scanOutputForPolicyViolations } from '../utils/output-policy-scan.util';

interface AiProcessingJobData {
  messageId: string;
}

// validate_reply's self-reported 0-100 confidence — chosen default, not
// account-configurable yet. 70 favors holding borderline replies for
// review over auto-sending them; revisit once there's real usage data on
// how confidence scores correlate with actually-good replies.
const REPLY_CONFIDENCE_AUTO_SEND_THRESHOLD = 70;

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
    @Inject(forwardRef(() => AgentService))
    private readonly agentService: AgentService,
    @Inject(forwardRef(() => ContactService))
    private readonly contactService: ContactService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
    @Inject(forwardRef(() => ApprovalChainService))
    private readonly approvalChainService: ApprovalChainService,
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

    // Same best-effort/concurrent shape as extractionPromise above.
    const summarizePromise = this.summarizeThread(
      message.threadId,
      subject,
      thread,
    );

    // CRM v1 (see docs/enterprise-ai-pipeline-plan.md §4) — best-effort,
    // no-op if this sender isn't an existing Contact (never auto-creates
    // one, see Contact's schema comment).
    const touchContactPromise = this.contactService
      .touchLastContacted(account.id, sender.address)
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to update Contact.lastContactedAt for ${sender.address}: ${String(error)}`,
        );
      });

    // Workflow Builder (v2.0 §3): evaluated here (before reply generation,
    // not after) specifically so an AI Agent persona (v2.0 §4) attached to
    // a matched rule's AUTO_REPLY action can influence the reply's actual
    // wording, not just the later send-vs-draft decision.
    const matchedActions = await this.workflowRuleService.evaluate(account.id, {
      category: classification.category,
      priority: classification.priority,
      sender: sender.address,
    });

    const autoReplyAction = matchedActions?.find(
      (action) => action.type === 'AUTO_REPLY',
    );
    const agentSystemPrompt = autoReplyAction?.agentId
      ? ((await this.agentService.getEnabledSystemPrompt(
          account.id,
          autoReplyAction.agentId,
        )) ?? undefined)
      : undefined;

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

    // Multi-agent orchestration §A (see docs/multi-agent-orchestration-plan.md)
    // — ground the reply in CRM data the same best-effort way as RAG/
    // contact-memory above. Null (not an error) for the common case: most
    // senders aren't a known Contact.
    const crmContact = await this.contactService
      .findByEmail(account.id, sender.address)
      .catch(() => null);

    const { instruction, contactMemoryUsed, crmContactUsed } =
      buildContextInstruction(
        related,
        contactMemory,
        documentMatches,
        crmContact,
      );

    const reply = await this.aiClientService.generateReply(
      subject,
      thread,
      instruction,
      agentSystemPrompt,
    );

    const generationMetadata: GenerationMetadata = {
      ragUsed: documentMatches.length > 0,
      contactMemoryUsed,
      crmContactUsed,
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

    // Output validation (see docs/enterprise-ai-pipeline-plan.md §6):
    // deterministic scans of what the LLM actually generated, not just
    // the account's own settings. Free (regex/substring, no LLM call), so
    // computed unconditionally rather than gated behind matchedActions.
    const outputPiiScan = scanOutputForPii(reply.reply);
    const outputPolicyScan = scanOutputForPolicyViolations(
      reply.reply,
      account.prohibitedPhrases,
    );

    // Workflow Builder (v2.0 §3): the account's WorkflowRule rows decide
    // whether this reply auto-sends (and any other actions — assign,
    // notify). matchedActions was already computed above (before reply
    // generation, so an agent persona could influence the reply's
    // wording) — executing it here just runs the actions themselves. No
    // matching rule falls through to the existing default: draft for
    // review.
    let isSafeToAutoSend = false;
    let approvalChainApproverUserIds: string[] | undefined;
    if (matchedActions) {
      const { autoReply, approvalChainApproverUserIds: chainApprovers } =
        await this.workflowRuleService.executeActions(matchedActions, {
          accountId: account.id,
          threadId: message.threadId,
          messageId,
        });
      approvalChainApproverUserIds = chainApprovers;

      // Hard safety rails, not rule-overridable, cheapest first — each
      // short-circuits before paying for the next:
      // - classify.md's prompt returns "Urgent" (capitalized) — matched
      //   case-insensitively here. A past bug compared against lowercase
      //   'urgent' directly and so never actually excluded urgent
      //   messages from auto-send; keeping the same guarantee even
      //   though the decision now otherwise comes from rules.
      // - outputPiiScan / outputPolicyScan: never auto-send text that
      //   looks like it contains an SSN/account number, or that trips
      //   the account's own prohibited-phrase list (empty by default).
      // - validateReply: a second, more expensive LLM call checking the
      //   draft actually addresses the thread, has no grammar issues,
      //   and self-reports enough confidence — only paid for once the
      //   cheaper rails already passed and this is genuinely the last
      //   thing standing between the reply and a real auto-send. A
      //   message that was always going to be drafted for human review
      //   doesn't need it — the human already provides this check.
      const passesUrgentRail =
        classification.priority.toLowerCase() !== 'urgent';
      const passesPiiRail = !outputPiiScan.detected;
      const passesPolicyRail = !outputPolicyScan.violated;

      let passesValidationRail = false;
      if (autoReply && passesUrgentRail && passesPiiRail && passesPolicyRail) {
        const { validation } = await this.aiClientService.validateReply(
          subject,
          thread,
          reply.reply,
        );

        // Tone is deliberately NOT a hard rail — more subjective/
        // error-prone for an LLM to judge than grammar or thread-
        // addressing, so blocking on it risks over-holding perfectly
        // good replies. Logged so it's visible, not silently dropped.
        if (!validation.toneAppropriate) {
          this.logger.warn(
            `Generated reply for message ${messageId} has a possible tone mismatch (not blocking auto-send): ${validation.toneNote || 'no specific note given'}.`,
          );
        }

        passesValidationRail =
          validation.addressesThread &&
          validation.unsupportedClaims.length === 0 &&
          validation.grammarIssues.length === 0 &&
          validation.confidence >= REPLY_CONFIDENCE_AUTO_SEND_THRESHOLD;

        if (!passesValidationRail) {
          const reasons: string[] = [];
          if (!validation.addressesThread) {
            reasons.push(
              `doesn't address the thread (${validation.concerns.join(', ') || 'no specific concern given'})`,
            );
          }
          if (validation.unsupportedClaims.length > 0) {
            reasons.push(
              `unsupported claims: ${validation.unsupportedClaims.join(', ')}`,
            );
          }
          if (validation.grammarIssues.length > 0) {
            reasons.push(
              `grammar issues: ${validation.grammarIssues.join(', ')}`,
            );
          }
          if (validation.confidence < REPLY_CONFIDENCE_AUTO_SEND_THRESHOLD) {
            reasons.push(
              `confidence ${validation.confidence} below the ${REPLY_CONFIDENCE_AUTO_SEND_THRESHOLD} threshold`,
            );
          }
          this.logger.warn(
            `Generated reply for message ${messageId} was held for review — ${reasons.join('; ')}.`,
          );
        }
      }

      isSafeToAutoSend =
        autoReply &&
        passesUrgentRail &&
        passesPiiRail &&
        passesPolicyRail &&
        passesValidationRail;
    }

    if (outputPiiScan.detected) {
      this.logger.warn(
        `Generated reply for message ${messageId} contains a possible ${outputPiiScan.types.join(', ')} — will not auto-send regardless of matching rules.`,
      );
    }

    if (outputPolicyScan.violated) {
      this.logger.warn(
        `Generated reply for message ${messageId} matched a prohibited phrase (${outputPolicyScan.matchedPhrases.join(', ')}) — will not auto-send regardless of matching rules.`,
      );
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

      // §7 post-processing (see docs/enterprise-ai-pipeline-plan.md) —
      // visibility into an autonomous action, not just a silent send. A
      // drafted (non-auto-sent) reply doesn't need this: it already sits
      // visibly in the Drafts folder awaiting the same review a
      // notification would prompt. Best-effort — a notification failure
      // must never be treated as the send itself having failed.
      await this.notificationService
        .create(
          account.userId,
          'Auto-replied to an email',
          `Sent from ${account.email} — "${subject}"`,
          { threadId: message.threadId, messageId },
        )
        .catch((error: unknown) => {
          this.logger.warn(
            `Failed to create auto-send notification for message ${messageId}: ${String(error)}`,
          );
        });
    } else {
      const draft = await this.composeService.saveDraftReply(
        account.userId,
        messageId,
        {
          subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
          bodyText: reply.reply,
        },
        generationMetadata,
      );

      // True multi-step Approval Chains (v3.0, see docs/MVP.md) — best-
      // effort, same posture as the auto-send notification above: the
      // draft itself is already safely saved either way, so a chain-
      // creation failure must never turn into a stuck/retried job.
      if (approvalChainApproverUserIds) {
        await this.approvalChainService
          .create(account.id, draft.id, approvalChainApproverUserIds)
          .catch((error: unknown) => {
            this.logger.warn(
              `Failed to create approval chain for draft ${draft.id}: ${String(error)}`,
            );
          });
      }

      this.logger.log(
        `Drafted a reply to message ${messageId} for review (category: ${classification.category}, ragUsed: ${generationMetadata.ragUsed}).`,
      );
    }

    // Awaited here (not earlier) so both run concurrently with the reply
    // pipeline above rather than serially in front of it, while still
    // guaranteeing they finish before the job is marked complete.
    await Promise.all([
      extractionPromise,
      summarizePromise,
      touchContactPromise,
    ]);

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
        language: classification.language,
        containsPii: classification.containsPii,
        piiTypes: classification.piiTypes,
      },
    });
  }

  /**
   * Re-summarizes the whole thread (overwrite, not append) each time a new
   * message lands on a thread with 2+ messages — a single fresh message
   * has nothing to compress, so threads only ever get a summary once a
   * real back-and-forth exists. Best-effort, same shape as extractTasks:
   * a slow/failed summarize call must never block the reply pipeline.
   */
  private async summarizeThread(
    threadId: string,
    subject: string,
    thread: EmailMessageDto[],
  ): Promise<void> {
    if (thread.length < 2) {
      return;
    }

    try {
      const { summary, keyPoints } = await this.aiClientService.summarize(
        subject,
        thread,
      );

      await this.prisma.emailThread.update({
        where: { id: threadId },
        data: { summary, summaryKeyPoints: keyPoints },
      });
    } catch (error) {
      this.logger.warn(
        `Thread summarization failed for thread ${threadId}: ${String(error)}`,
      );
    }
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
  crmContact: ContactModel | null,
): {
  instruction: string | undefined;
  contactMemoryUsed: boolean;
  crmContactUsed: boolean;
} {
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

  // Multi-agent orchestration §A (see docs/multi-agent-orchestration-plan.md)
  // — the sender's CRM record, when one exists. Distinct from
  // contactMemory above: this is user-entered/curated data (status,
  // company, notes), not AI-inferred facts.
  if (crmContact) {
    const lines: string[] = [];
    if (crmContact.status) lines.push(`Status: ${crmContact.status}`);
    if (crmContact.company) lines.push(`Company: ${crmContact.company}`);
    if (crmContact.notes) lines.push(`Notes: ${crmContact.notes}`);
    if (crmContact.lastContactedAt) {
      lines.push(`Last contacted: ${crmContact.lastContactedAt.toISOString()}`);
    }
    if (lines.length > 0) {
      sections.push(
        `This sender is a known CRM contact${crmContact.name ? ` (${crmContact.name})` : ''}:\n${lines.join('\n')}`,
      );
    }
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
    crmContactUsed: !!crmContact,
  };
}
