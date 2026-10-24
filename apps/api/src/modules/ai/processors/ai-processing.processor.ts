import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  Inject,
  Logger,
  OnApplicationBootstrap,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';

import { PrismaService } from '../../../database';
import { AutomationEffectKind } from '../../../generated/prisma/enums';
import type { InputJsonValue } from '../../../generated/prisma/internal/prismaNamespace';
import {
  ContactModel,
  EmailAccountModel,
} from '../../../generated/prisma/models';
import {
  AIJobs,
  QueueNames,
  QueueService,
} from '../../../infrastructure/queue';
// Leaf-file import rather than the '../../agent' barrel — see the
// comment below on WorkflowRuleService for why.
import { AgentService } from '../../agent/services/agent.service';
// Leaf-file import rather than the '../../approval' barrel — same
// reasoning as AgentService below.
import { ApprovalChainService } from '../../approval/services/approval-chain.service';
// Leaf-file imports rather than the '../../calendar' barrel — see the
// comment in meeting-scheduling.service.ts for why (avoids a Jest-only
// circular require through calendar.module.ts <-> ai.module.ts).
import { CalendarContextService } from '../../calendar/services/calendar-context.service';
import { MeetingSchedulingService } from '../../calendar/services/meeting-scheduling.service';
// Leaf-file import rather than the '../../crm' barrel — same reasoning as
// AgentService below.
import { ContactService } from '../../crm/services/contact.service';
import {
  DocumentChunkMatch,
  DocumentsService,
} from '../../documents/services/documents.service';
import { isAutomatedAddress } from '../../email/providers/bulk-mail.util';
import {
  AUTO_REPLY_HEADERS,
  ComposeService,
  GenerationMetadata,
} from '../../email/services/compose.service';
// Leaf-file import rather than the '../../notification' barrel — same
// reasoning as AgentService above.
import { NotificationService } from '../../notification/services/notification.service';
import { TasksService } from '../../tasks';
// Leaf-file import rather than the '../../workflow' barrel — see the
// comment above on MeetingSchedulingService for why.
import {
  ReplyDirectives,
  WorkflowRuleService,
  resolveReplyDirectives,
} from '../../workflow/services/workflow-rule.service';
import { buildRuleMessageContext } from '../../workflow/utils/rule-context.util';
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
import { scanOutputForActionClaims } from '../utils/action-claim-scan.util';
import {
  classifySenderTrust,
  findVerbatimQuote,
} from '../utils/grounding-guard.util';
import { scanOutputForPii } from '../utils/output-pii-scan.util';
import { findNoReplyReason } from '../utils/reply-need.util';
import { scheduleAutoSend } from '../utils/send-schedule.util';
import { hasSignature, withSignature } from '../utils/signature.util';
import {
  buildThreadContext,
  firstParticipant,
  stripQuotedHistory,
  toEmailMessageDto,
} from '../utils/thread-context.util';
import { scanOutputForPolicyViolations } from '../utils/output-policy-scan.util';

interface AiProcessingJobData {
  messageId: string;
}

// Auto-responder loop protection (see docs/email-automation-gaps.md G-04):
// even with every inbound auto-reply signal checked, cap how often we
// autonomously answer the same conversation or the same person, so a
// responder we fail to recognise still can't ping-pong with us. Anything
// over the cap is held as a draft, never dropped.
const AUTO_SEND_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_AUTO_SENDS_PER_THREAD = 1;
const MAX_AUTO_SENDS_PER_RECIPIENT = 3;

const AI_FAILED_NOTIFICATION_TITLE = 'AI processing failed';
const SEND_LIMIT_NOTIFICATION_TITLE = 'Auto-send limit reached';
const HOUR_MS = 60 * 60 * 1000;

interface EffectContext {
  messageId: string;
  accountId: string;
  threadId: string;
}

@Processor(QueueNames.AI)
export class AiProcessingProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
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
    @Inject(forwardRef(() => CalendarContextService))
    private readonly calendarContextService: CalendarContextService,
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
    private readonly configService: ConfigService,
    private readonly queueService: QueueService,
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
            account: {
              include: {
                user: {
                  select: {
                    timezone: true,
                    displayName: true,
                    jobTitle: true,
                    companyName: true,
                  },
                },
              },
            },
            messages: {
              orderBy: { receivedAt: 'asc' },
              include: {
                attachments: {
                  where: { isInline: false },
                  select: { filename: true, mimeType: true, size: true },
                },
              },
            },
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
    // Quoted history stripped and capped to a token budget — every LLM
    // call below sees this, not the raw thread (see thread-context.util).
    const thread = buildThreadContext(
      message.thread.messages.map(toEmailMessageDto),
    );
    const ownAddresses = [account.email, ...account.aliases];

    const classifyResult = await this.aiClientService.classify(subject, thread);
    const classification = classifyResult.classification;

    // Whether this message calls for a reply at all: cheap deterministic
    // checks first (acknowledgement-only, user only Cc'd), then the
    // model's own judgement. Decides below whether a reply is generated.
    const noReplyReason =
      findNoReplyReason(
        message,
        stripQuotedHistory(message.bodyText ?? ''),
        ownAddresses,
      ) ??
      // The model judges this message alone. If it supersedes an earlier,
      // still-unanswered question in the thread (see findSupersededReason),
      // this is the job that has to answer the conversation, so it replies
      // even when its own content wouldn't need one.
      (classification.needsReply ||
      hasUnansweredEarlierInbound(message, ownAddresses)
        ? null
        : classification.replyReason || 'no reply needed');

    // Persisted regardless of the spam branch below — the classification
    // was already paid for, and Priority Inbox wants a record of it even
    // for messages that get skipped past this point (see
    // docs/v1.2-plan.md's "Priority Inbox" section, previously discarded).
    await this.persistClassification(messageId, classification, noReplyReason);

    if (classification.spam) {
      this.logger.log(`Message ${messageId} classified as spam, skipping.`);
      await this.markProcessed(messageId);
      return;
    }

    if (classification.priority.toLowerCase() === 'urgent') {
      await this.notificationService
        .create(
          account.userId,
          `Urgent email from ${sender.name ?? sender.address}`,
          `"${subject}" was classified as urgent.`,
          { threadId: message.threadId, messageId },
          'URGENT_MAIL',
        )
        .catch((error: unknown) => {
          this.logger.warn(
            `Failed to create urgent-mail notification for message ${messageId}: ${describeError(error)}`,
          );
        });
    }

    const effectContext: EffectContext = {
      messageId,
      accountId: account.id,
      threadId: message.threadId,
    };

    // Best-effort, non-blocking: a failed/slow extraction call must never
    // stop the reply from being generated. Not awaited alongside the
    // pipeline below on purpose — kicked off here so it runs concurrently
    // with contactMemory/reply generation rather than adding to the
    // critical path. Claimed in the effect ledger first so a retried job
    // doesn't create the same tasks (and auto-schedule the same meetings)
    // twice; the trade-off is that a crash mid-extraction loses that one
    // extraction, which is acceptable for a best-effort step.
    const extractionPromise = this.claimEffect(effectContext, 'TASK_EXTRACTION')
      .then((claimed) =>
        claimed
          ? this.extractTasks(
              account.userId,
              messageId,
              message.threadId,
              subject,
              thread,
              account.autoScheduleMeetings,
            )
          : undefined,
      )
      .catch((error: unknown) => {
        this.logger.warn(
          `Task extraction claim failed for message ${messageId}: ${describeError(error)}`,
        );
      });

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
    // wording, not just the later send-vs-draft decision. Every matching
    // rule runs (until one says STOP_PROCESSING); the first one with a
    // reply action decides the reply (resolveReplyDirectives).
    const matchedRules = await this.workflowRuleService.evaluate(
      account.id,
      async (needsKnownContact) =>
        buildRuleMessageContext({
          // The row was read before classification was persisted.
          message: {
            ...message,
            category: classification.category,
            priority: classification.priority,
            sentiment: classification.sentiment,
            language: classification.language,
            containsPii: classification.containsPii,
          },
          threadReceivedAt: message.thread.messages
            .filter((other) => other.id !== message.id)
            .map((other) => other.receivedAt),
          threadSubject: message.thread.subject,
          hasAttachment:
            (message.thread.messages.find((other) => other.id === message.id)
              ?.attachments?.length ?? 0) > 0,
          account,
          timezone: account.user.timezone,
          isKnownContact: needsKnownContact
            ? await this.workflowRuleService.isKnownContact(
                account.id,
                sender.address,
              )
            : false,
        }),
    );

    const replyDirectives: ReplyDirectives | null =
      matchedRules.length > 0 ? resolveReplyDirectives(matchedRules) : null;
    const autoReplyAction = replyDirectives?.autoReplyAction;
    const agentSystemPrompt = autoReplyAction?.agentId
      ? ((await this.agentService.getEnabledSystemPrompt(
          account.id,
          autoReplyAction.agentId,
        )) ?? undefined)
      : undefined;

    // The matched rules' side-effect actions (assign, notify, Slack/Teams,
    // HubSpot, forward, label, ...) run here, before reply generation, so
    // routing still happens even if contact memory or reply generation
    // fails below. Claimed in the effect ledger: on a retried job they
    // already ran; the reply decision above is side-effect free.
    if (
      matchedRules.length > 0 &&
      (await this.claimEffect(effectContext, 'RULE_ACTIONS'))
    ) {
      await this.workflowRuleService.executeActions(matchedRules, {
        accountId: account.id,
        ownerUserId: account.userId,
        threadId: message.threadId,
        messageId,
        senderEmail: sender.address,
        senderName: sender.name,
        subject,
        category: classification.category,
        priority: classification.priority,
        isAutoReply: message.isAutoReply,
      });
    }

    // Idempotency for the reply itself: a previous attempt of this job may
    // already have drafted or sent it before failing on something later.
    const [priorSend, priorDraft] = await Promise.all([
      this.findEffect(messageId, 'SEND'),
      this.findEffect(messageId, 'DRAFT'),
    ]);

    if (priorDraft || priorSend?.status === 'DONE') {
      this.logger.log(
        `Reply for message ${messageId} was already ${priorDraft ? 'drafted' : 'sent'} by an earlier attempt, not generating another.`,
      );
      await Promise.all([
        extractionPromise,
        summarizePromise,
        touchContactPromise,
      ]);
      await this.markProcessed(messageId);
      return;
    }

    // A PENDING send means an earlier attempt crashed between claiming the
    // send and recording its result — the email may or may not have gone
    // out. Sending again could duplicate it, so the reply is held as a
    // draft and the user is told to check, instead of guessing.
    const sendOutcomeUnknown = priorSend?.status === 'PENDING';

    // Whether to generate a reply at all. Routing (rule actions) already
    // ran above; this only decides the reply. Skipped when the message
    // needs none, or when replying to it would duplicate or contradict the
    // conversation's current state. Not checked for an unknown-outcome
    // send — that path must still leave the user a draft to compare.
    const skipReplyReason = sendOutcomeUnknown
      ? null
      : (noReplyReason ??
        (await this.findSupersededReason(
          message,
          ownAddresses,
          account.userId,
        )));

    if (skipReplyReason) {
      this.logger.log(
        `No reply generated for message ${messageId}: ${skipReplyReason}.`,
      );
      await Promise.all([
        extractionPromise,
        summarizePromise,
        touchContactPromise,
      ]);
      await this.markProcessed(messageId);
      return;
    }

    // Calendar Agent (v3.0 multi-agent orchestration §Option B, see
    // docs/multi-agent-orchestration-plan.md) — runs regardless of which
    // action ends up executing (a drafted reply benefits from
    // availability-aware phrasing just as much as an auto-sent one);
    // `calendarAgent: false` on a matched AUTO_REPLY action is the only
    // opt-out. Best-effort — CalendarContextService never throws.
    const calendarAgentEnabled = autoReplyAction?.calendarAgent !== false;
    const calendarContext =
      calendarAgentEnabled &&
      classification.category.toLowerCase() === 'meeting'
        ? await this.calendarContextService.buildAvailabilityContext(
            account.userId,
          )
        : null;

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
      sender.address,
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

    const {
      instruction,
      contactMemoryUsed,
      crmContactUsed,
      calendarAgentUsed,
    } = buildContextInstruction(
      contactMemory,
      related,
      documentMatches,
      crmContact,
      calendarContext,
    );

    const reply = await this.aiClientService.generateReply(
      subject,
      thread,
      instruction,
      agentSystemPrompt,
      {
        name: account.user.displayName ?? account.displayName,
        jobTitle: account.user.jobTitle,
        company: account.user.companyName,
        hasSignature: hasSignature(account),
      },
    );

    const generationMetadata: GenerationMetadata = {
      agentId: agentSystemPrompt ? autoReplyAction?.agentId : undefined,
      ragUsed: documentMatches.length > 0,
      contactMemoryUsed,
      crmContactUsed,
      calendarAgentUsed,
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
    const actionClaimScan = scanOutputForActionClaims(reply.reply);

    // Workflow Builder (v2.0 §3): the account's WorkflowRule rows decide
    // whether this reply auto-sends. replyDirectives was already resolved
    // above (and the rule's other actions already ran). No matching rule
    // falls through to the existing default: draft for review.
    let isSafeToAutoSend = false;
    let replyConfidence: number | undefined;
    // Set whenever validate_reply ran: claims the model made that the
    // thread and context don't support. Shown on a held draft's card.
    let unsupportedClaims: string[] | undefined;
    const approvalChainApproverUserIds =
      replyDirectives?.approvalChainApproverUserIds;
    const confidenceThreshold = account.autoSendConfidenceThreshold;

    // Account/loop-level blockers, checked before any of the per-reply
    // rails below (and before paying for validateReply).
    const autoSendBlocker =
      replyDirectives?.autoReply && !sendOutcomeUnknown
        ? await this.findAutoSendBlocker(
            account,
            message.threadId,
            message.isAutoReply,
            sender.address,
          )
        : null;

    if (autoSendBlocker) {
      this.logger.warn(
        `Reply for message ${messageId} held for review instead of auto-sending — ${autoSendBlocker}.`,
      );
    }

    if (replyDirectives && !autoSendBlocker && !sendOutcomeUnknown) {
      const { autoReply } = replyDirectives;

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
      // - actionClaimScan: never auto-send a reply saying a task is
      //   already done or a file is attached — the AI can do neither, and
      //   validateReply reliably misses these (the request is in the
      //   thread, so the claim "looks" supported).
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
      const passesActionClaimRail = !actionClaimScan.detected;
      const groundingBlocker = autoReply
        ? await this.findGroundingBlocker(
            account,
            sender.address,
            crmContact !== null,
            reply.reply,
            documentMatches,
            autoReplyAction?.allowUnknownSenderGrounding === true,
          )
        : null;
      const passesGroundingRail = groundingBlocker === null;
      if (groundingBlocker) {
        this.logger.warn(
          `Generated reply for message ${messageId} held for review — ${groundingBlocker}.`,
        );
      }

      let passesValidationRail = false;
      if (
        autoReply &&
        passesUrgentRail &&
        passesPiiRail &&
        passesPolicyRail &&
        passesActionClaimRail &&
        passesGroundingRail
      ) {
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

        replyConfidence = validation.confidence;
        unsupportedClaims = validation.unsupportedClaims;
        passesValidationRail =
          validation.addressesThread &&
          validation.unsupportedClaims.length === 0 &&
          validation.grammarIssues.length === 0 &&
          validation.confidence >= confidenceThreshold;

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
          if (validation.confidence < confidenceThreshold) {
            reasons.push(
              `confidence ${validation.confidence} below the ${confidenceThreshold} threshold`,
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
        passesActionClaimRail &&
        passesGroundingRail &&
        passesValidationRail;
    }

    if (actionClaimScan.detected) {
      this.logger.warn(
        `Generated reply for message ${messageId} says a task is already done or a file is attached — will not auto-send regardless of matching rules.`,
      );
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

    // The signature is added after every check above ran on the model's
    // own text, so a phone number in it can't trip the PII rail.
    const signed = withSignature(reply.reply, account);

    // Claimed before sending: if another attempt already claimed this send
    // (a concurrent duplicate job), this one must not send at all. The
    // details are what the automation audit log shows for this send.
    if (
      isSafeToAutoSend &&
      !(await this.claimEffect(effectContext, 'SEND', {
        recipient: sender.address.toLowerCase(),
        details: {
          rule: replyDirectives?.decidingRule ?? null,
          confidence: replyConfidence ?? null,
          documents: documentMatches.map(
            (match: DocumentChunkMatch) => match.filename,
          ),
        },
      }))
    ) {
      this.logger.warn(
        `Send for message ${messageId} was already claimed by another attempt, skipping.`,
      );
      await Promise.all([
        extractionPromise,
        summarizePromise,
        touchContactPromise,
      ]);
      await this.markProcessed(messageId);
      return;
    }

    // The cap check in findAutoSendBlocker ran before this job claimed its
    // send, so two jobs for the same thread/recipient running concurrently
    // could both have passed it. Re-checked now that the claim exists,
    // counting everyone ELSE's claims: whichever jobs raced both see each
    // other and both fall back to a draft — fails closed, never double-sends.
    if (
      isSafeToAutoSend &&
      (await this.exceedsAutoSendCaps(
        account,
        message.threadId,
        sender.address,
        messageId,
      ))
    ) {
      this.logger.warn(
        `Reply for message ${messageId} held for review — another auto-reply to this thread/recipient was claimed concurrently.`,
      );
      await this.releaseEffect(messageId, 'SEND');
      isSafeToAutoSend = false;
    }

    // Undo window, DELAY_SEND and quiet hours: the approved reply waits
    // as a scheduled draft instead of sending now (it can be cancelled).
    const sendAt = isSafeToAutoSend
      ? scheduleAutoSend(new Date(), {
          undoSendSeconds: account.undoSendSeconds,
          delaySendMinutes: replyDirectives?.delaySendMinutes,
          quietHours: {
            start: account.quietHoursStart,
            end: account.quietHoursEnd,
          },
          timezone: account.user.timezone,
        })
      : null;

    if (isSafeToAutoSend && sendAt) {
      const draft = await this.composeService.saveDraftReply(
        account.userId,
        messageId,
        {
          subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
          bodyText: signed.text,
          bodyHtml: signed.html,
        },
        generationMetadata,
        {
          replyAll: autoReplyAction?.replyAll === true,
          scheduledSendAt: sendAt,
        },
      );
      await this.prisma.automationEffect.update({
        where: { messageId_kind: { messageId, kind: 'SEND' } },
        data: {
          status: 'SCHEDULED',
          details: {
            rule: replyDirectives?.decidingRule ?? null,
            confidence: replyConfidence ?? null,
            documents: documentMatches.map(
              (match: DocumentChunkMatch) => match.filename,
            ),
            draftMessageId: draft.id,
            scheduledFor: sendAt.toISOString(),
          },
        },
      });
      await this.queueService.enqueueScheduledSend(draft.id, sendAt);
      await this.claimEffect(effectContext, 'DRAFT', { status: 'DONE' });

      this.logger.log(
        `Scheduled an auto-reply to message ${messageId} for ${sendAt.toISOString()} (draft ${draft.id}).`,
      );
      await this.notificationService
        .create(
          account.userId,
          'Auto-reply scheduled',
          `A reply to "${subject}" will send at ${sendAt.toISOString()} unless you cancel it from Drafts.`,
          { threadId: message.threadId, messageId, draftId: draft.id },
        )
        .catch((error: unknown) => {
          this.logger.warn(
            `Failed to create scheduled-send notification for message ${messageId}: ${describeError(error)}`,
          );
        });
    } else if (isSafeToAutoSend) {
      let sent: { providerMessageId: string };
      try {
        sent = await this.composeService.reply(
          account.userId,
          {
            messageId,
            bodyHtml: signed.html,
            bodyText: signed.text,
            replyAll: autoReplyAction?.replyAll === true,
          },
          generationMetadata,
          { headers: AUTO_REPLY_HEADERS },
        );
      } catch (error) {
        // The provider rejected the send, so nothing went out — release
        // the claim so the job's retry is allowed to try again.
        await this.releaseEffect(messageId, 'SEND');
        throw error;
      }

      await this.prisma.automationEffect.update({
        where: { messageId_kind: { messageId, kind: 'SEND' } },
        data: { status: 'DONE', providerMessageId: sent.providerMessageId },
      });
      await this.prisma.aiDraftOutcome
        .create({
          data: {
            accountId: account.id,
            agentId: generationMetadata.agentId,
            outcome: 'AUTO_SENT',
          },
        })
        .catch(() => undefined);

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
      // A held draft still gets the invented-facts check (if the auto-send
      // path didn't already run it): a reviewer skimming a fluent draft is
      // exactly who misses a made-up date or status. Best-effort — the
      // draft is saved either way.
      if (unsupportedClaims === undefined) {
        unsupportedClaims = await this.aiClientService
          .validateReply(subject, thread, reply.reply)
          .then(({ validation }) => validation.unsupportedClaims)
          .catch((error: unknown) => {
            this.logger.warn(
              `Draft check failed for message ${messageId}: ${describeError(error)}`,
            );
            return undefined;
          });
      }
      // The deterministic claims go first: they're the ones the LLM check
      // above tends to miss.
      if (actionClaimScan.detected) {
        unsupportedClaims = [
          ...actionClaimScan.claims,
          ...(unsupportedClaims ?? []),
        ];
      }

      const draft = await this.composeService.saveDraftReply(
        account.userId,
        messageId,
        {
          subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
          bodyText: signed.text,
          bodyHtml: signed.html,
        },
        unsupportedClaims?.length
          ? { ...generationMetadata, unsupportedClaims }
          : generationMetadata,
        { replyAll: autoReplyAction?.replyAll === true },
      );

      // True multi-step Approval Chains (v3.0, see docs/MVP.md) — best-
      // effort, same posture as the auto-send notification above: the
      // draft itself is already safely saved either way, so a chain-
      // creation failure must never turn into a stuck/retried job.
      if (approvalChainApproverUserIds) {
        await this.approvalChainService
          .create(account.id, draft.id, approvalChainApproverUserIds, {
            expiresInHours: replyDirectives?.approvalChainExpiresInHours,
          })
          .catch(async (error: unknown) => {
            this.logger.warn(
              `Failed to create approval chain for draft ${draft.id}: ${describeError(error)}`,
            );
            // The draft is still held (nothing auto-sends), but nobody
            // was asked to approve it — say so instead of failing silently.
            await this.notificationService
              .create(
                account.userId,
                "Approval chain couldn't be started",
                `A reply to "${subject}" is waiting in Drafts, but its approval chain couldn't be created: ${describeError(error)}`,
                { threadId: message.threadId, messageId, draftId: draft.id },
              )
              .catch(() => undefined);
          });
      }

      await this.claimEffect(effectContext, 'DRAFT', { status: 'DONE' });

      // Approvers of a chain are notified by the chain itself, and the
      // unknown-outcome case below has its own warning.
      if (!approvalChainApproverUserIds && !sendOutcomeUnknown) {
        await this.notificationService
          .create(
            account.userId,
            'AI draft ready for review',
            `A reply to "${subject}" is waiting in Drafts.`,
            { threadId: message.threadId, messageId, draftId: draft.id },
            'DRAFT_READY',
          )
          .catch((error: unknown) => {
            this.logger.warn(
              `Failed to create draft-ready notification for message ${messageId}: ${describeError(error)}`,
            );
          });
      }

      if (sendOutcomeUnknown) {
        await this.notificationService
          .create(
            account.userId,
            'Check whether an auto-reply was sent',
            `An earlier attempt to auto-reply to "${subject}" was interrupted, so it may or may not have been sent. The reply is in Drafts — check Sent before sending it.`,
            { threadId: message.threadId, messageId, draftId: draft.id },
          )
          .catch((error: unknown) => {
            this.logger.warn(
              `Failed to create send-outcome-unknown notification for message ${messageId}: ${describeError(error)}`,
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

  /**
   * Records an effect in the ledger before it runs. Returns false — and the
   * caller must skip the effect — when a row for this (message, kind)
   * already exists, i.e. an earlier or concurrent attempt got there first.
   */
  private async claimEffect(
    context: EffectContext,
    kind: AutomationEffectKind,
    extra: {
      recipient?: string;
      status?: 'PENDING' | 'DONE';
      details?: Record<string, unknown>;
    } = {},
  ): Promise<boolean> {
    try {
      await this.prisma.automationEffect.create({
        data: {
          ...context,
          kind,
          ...extra,
          details: extra.details as InputJsonValue | undefined,
        },
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }
      throw error;
    }
  }

  private findEffect(messageId: string, kind: AutomationEffectKind) {
    return this.prisma.automationEffect.findUnique({
      where: { messageId_kind: { messageId, kind } },
      select: { status: true },
    });
  }

  private async releaseEffect(
    messageId: string,
    kind: AutomationEffectKind,
  ): Promise<void> {
    await this.prisma.automationEffect
      .delete({ where: { messageId_kind: { messageId, kind } } })
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to release ${kind} claim for message ${messageId}: ${describeError(error)}`,
        );
      });
  }

  /**
   * Reasons a rule-approved auto-send must be held as a draft regardless of
   * how good the reply is: the kill switches, an inbound auto-reply (the
   * loop case), the per-thread / per-recipient loop caps, and the account's
   * own hourly/daily send caps. Returns null when nothing blocks it.
   * Cancelled scheduled sends don't count toward any cap.
   */
  private async findAutoSendBlocker(
    account: EmailAccountModel,
    threadId: string,
    inboundIsAutoReply: boolean,
    recipientAddress: string,
  ): Promise<string | null> {
    if (this.configService.get<string>('AUTO_SEND_ENABLED') === 'false') {
      return 'auto-send is disabled globally (AUTO_SEND_ENABLED=false)';
    }

    if (!account.autoSendEnabled) {
      return `auto-send is disabled for ${account.email}`;
    }

    if (inboundIsAutoReply) {
      return 'the inbound message is itself an automatic reply (auto-responder loop protection)';
    }

    const since = new Date(Date.now() - AUTO_SEND_WINDOW_MS);
    const sends = {
      kind: 'SEND' as const,
      status: { not: 'CANCELLED' as const },
    };

    const [threadSends, recipientSends, hourSends, daySends] =
      await Promise.all([
        this.prisma.automationEffect.count({
          where: { ...sends, threadId, createdAt: { gte: since } },
        }),
        this.prisma.automationEffect.count({
          where: {
            ...sends,
            accountId: account.id,
            recipient: recipientAddress.toLowerCase(),
            createdAt: { gte: since },
          },
        }),
        this.prisma.automationEffect.count({
          where: {
            ...sends,
            accountId: account.id,
            createdAt: { gte: new Date(Date.now() - HOUR_MS) },
          },
        }),
        this.prisma.automationEffect.count({
          where: { ...sends, accountId: account.id, createdAt: { gte: since } },
        }),
      ]);

    if (threadSends >= MAX_AUTO_SENDS_PER_THREAD) {
      return `this thread already got ${threadSends} auto-reply(s) in the last 24h`;
    }

    if (recipientSends >= MAX_AUTO_SENDS_PER_RECIPIENT) {
      return `${recipientAddress} already got ${recipientSends} auto-replies in the last 24h`;
    }

    const capReached =
      hourSends >= account.autoSendHourlyCap
        ? `the account's limit of ${account.autoSendHourlyCap} auto-replies per hour was reached`
        : daySends >= account.autoSendDailyCap
          ? `the account's limit of ${account.autoSendDailyCap} auto-replies per day was reached`
          : null;
    if (capReached) {
      await this.notifySendLimitReached(account, capReached);
    }

    return capReached;
  }

  /** Tells the owner once per 24h that replies are being held because of
   * a send cap — not once per held reply. */
  private async notifySendLimitReached(
    account: EmailAccountModel,
    reason: string,
  ): Promise<void> {
    try {
      const recentlyNotified = await this.prisma.notification.count({
        where: {
          userId: account.userId,
          title: SEND_LIMIT_NOTIFICATION_TITLE,
          createdAt: { gte: new Date(Date.now() - AUTO_SEND_WINDOW_MS) },
        },
      });
      if (recentlyNotified === 0) {
        await this.notificationService.create(
          account.userId,
          SEND_LIMIT_NOTIFICATION_TITLE,
          `Auto-replies from ${account.email} are being held as drafts: ${reason}. You can raise the limit in the account's automation settings.`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Couldn't notify about the send limit for ${account.email}: ${describeError(error)}`,
      );
    }
  }

  /**
   * Prompt-injection containment (G-07) for autonomous sends — the inbound
   * email can steer the model into quoting the user's private documents
   * back. A reply goes out unreviewed only if:
   * - it isn't grounded in documents at all, or the sender is INTERNAL /
   *   KNOWN (or the rule explicitly opted in via allowUnknownSenderGrounding,
   *   e.g. a support inbox answering strangers from public docs); and
   * - it doesn't quote a long verbatim run of a retrieved document to
   *   anyone outside the organisation.
   * Returns why it's blocked, or null. Drafts are unaffected — a human
   * reviews those.
   */
  private async findGroundingBlocker(
    account: EmailAccountModel,
    senderAddress: string,
    isCrmContact: boolean,
    replyText: string,
    documentMatches: DocumentChunkMatch[],
    allowUnknownSenderGrounding: boolean,
  ): Promise<string | null> {
    if (documentMatches.length === 0) {
      return null;
    }

    const ownAddresses = [account.email, ...account.aliases];
    const isKnownCorrespondent =
      isCrmContact ||
      (await this.prisma.emailMessage.count({
        where: {
          thread: { accountId: account.id },
          to: { array_contains: [{ address: senderAddress }] },
        },
      })) > 0;
    const trust = classifySenderTrust(
      senderAddress,
      ownAddresses,
      isKnownCorrespondent,
    );

    if (trust === 'UNKNOWN' && !allowUnknownSenderGrounding) {
      return `it draws on your documents and ${senderAddress} is an unknown sender`;
    }

    if (trust !== 'INTERNAL') {
      const quoted = findVerbatimQuote(replyText, documentMatches);
      if (quoted) {
        return `it quotes "${quoted}" verbatim to an external sender`;
      }
    }

    return null;
  }

  /** True when OTHER messages' send claims already fill the thread,
   * recipient or account caps — see the post-claim re-check in
   * processMessage. */
  private async exceedsAutoSendCaps(
    account: EmailAccountModel,
    threadId: string,
    recipientAddress: string,
    ownMessageId: string,
  ): Promise<boolean> {
    const since = new Date(Date.now() - AUTO_SEND_WINDOW_MS);
    const others = {
      kind: 'SEND' as const,
      status: { not: 'CANCELLED' as const },
      createdAt: { gte: since },
      messageId: { not: ownMessageId },
    };

    const [threadSends, recipientSends, hourSends, daySends] =
      await Promise.all([
        this.prisma.automationEffect.count({ where: { ...others, threadId } }),
        this.prisma.automationEffect.count({
          where: {
            ...others,
            accountId: account.id,
            recipient: recipientAddress.toLowerCase(),
          },
        }),
        this.prisma.automationEffect.count({
          where: {
            ...others,
            accountId: account.id,
            createdAt: { gte: new Date(Date.now() - HOUR_MS) },
          },
        }),
        this.prisma.automationEffect.count({
          where: { ...others, accountId: account.id },
        }),
      ]);

    return (
      threadSends >= MAX_AUTO_SENDS_PER_THREAD ||
      recipientSends >= MAX_AUTO_SENDS_PER_RECIPIENT ||
      hourSends >= account.autoSendHourlyCap ||
      daySends >= account.autoSendDailyCap
    );
  }

  /**
   * After a job's LAST attempt fails, record it on the message so the
   * failure is visible ("AI processing failed — retry") instead of the
   * job just vanishing into BullMQ's failed set. The user gets at most one
   * notification per hour about failures, not one per message.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<AiProcessingJobData>, error: Error): Promise<void> {
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) {
      return;
    }

    const { messageId } = job.data;
    this.logger.error(
      `AI processing for message ${messageId} failed after ${job.attemptsMade} attempt(s): ${error.message}`,
    );

    try {
      const message = await this.prisma.emailMessage.update({
        where: { id: messageId },
        data: { aiFailedAt: new Date(), aiError: error.message.slice(0, 1000) },
        select: {
          threadId: true,
          thread: { select: { account: { select: { userId: true } } } },
        },
      });

      const userId = message.thread.account.userId;
      const recentlyNotified = await this.prisma.notification.count({
        where: {
          userId,
          title: AI_FAILED_NOTIFICATION_TITLE,
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
      });

      if (recentlyNotified === 0) {
        await this.notificationService.create(
          userId,
          AI_FAILED_NOTIFICATION_TITLE,
          'The AI assistant couldn\'t process one or more new emails. Open the message and use "Retry AI" once the issue is resolved.',
          { threadId: message.threadId, messageId },
        );
      }
    } catch (recordError) {
      this.logger.warn(
        `Couldn't record AI failure for message ${messageId}: ${describeError(recordError)}`,
      );
    }
  }

  /** Worker concurrency is configured here rather than in @Processor()
   * because decorator arguments are evaluated before ConfigModule loads
   * .env. Each job is idempotent (the effect ledger), so running several
   * at once is safe; one slow LLM call no longer stalls the whole queue. */
  onApplicationBootstrap(): void {
    const concurrency = Number(
      this.configService.get<string>('AI_WORKER_CONCURRENCY') ?? 4,
    );
    if (Number.isInteger(concurrency) && concurrency > 0) {
      this.worker.concurrency = concurrency;
    }
  }

  /**
   * One reply per conversation state (docs/email-automation-gaps.md G-16).
   * A reply to this message would be redundant when:
   * - a NEWER inbound message exists in the thread — its own job answers
   *   the conversation as it now stands (bursts collapse into one reply);
   * - the user already replied after this message arrived.
   * And an earlier AI draft still waiting in the thread is superseded: if
   * nobody touched it, it's discarded so this reply replaces it; if a human
   * edited it or an approval chain is running on it, that work wins and no
   * new reply is generated. Returns why to skip, or null to go ahead.
   */
  private async findSupersededReason(
    message: {
      id: string;
      receivedAt: Date;
      thread: { messages: ThreadRow[] };
    },
    ownAddresses: string[],
    ownerUserId: string,
  ): Promise<string | null> {
    const later = message.thread.messages.filter(
      (other) =>
        other.id !== message.id && other.receivedAt > message.receivedAt,
    );
    if (later.some((other) => isFromOwn(other, ownAddresses))) {
      return 'you already replied after it';
    }
    if (later.some((other) => mayNeedReply(other, ownAddresses))) {
      return 'a newer message in the thread will be answered instead';
    }

    const otherIds = message.thread.messages
      .map((other) => other.id)
      .filter((id) => id !== message.id);
    if (otherIds.length === 0) {
      return null;
    }

    const earlierDrafts = await this.prisma.emailMessage.findMany({
      where: {
        inReplyToMessageId: { in: otherIds },
        thread: { folder: { type: 'DRAFTS' } },
      },
      select: {
        id: true,
        bodyText: true,
        generationMetadata: true,
        approvalChain: { select: { status: true } },
      },
    });

    for (const draft of earlierDrafts) {
      const original = (
        draft.generationMetadata as { draftText?: string } | null
      )?.draftText;
      const untouched =
        original !== undefined &&
        original.trim() === (draft.bodyText ?? '').trim() &&
        draft.approvalChain?.status !== 'PENDING';

      if (!untouched) {
        return 'an earlier draft in this thread is already being worked on';
      }

      await this.composeService.deleteDraft(ownerUserId, draft.id, {
        recordOutcome: false,
      });
      this.logger.log(
        `Discarded superseded AI draft ${draft.id} (thread moved on to message ${message.id}).`,
      );
    }

    return null;
  }

  private async persistClassification(
    messageId: string,
    classification: ClassificationResult,
    noReplyReason: string | null,
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
        needsReply: noReplyReason === null,
        replyReason: noReplyReason ?? (classification.replyReason || null),
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
      data: { aiProcessedAt: new Date(), aiFailedAt: null, aiError: null },
    });
  }
}

/** The thread-message fields the reply-supersession checks read. */
interface ThreadRow {
  id: string;
  from: unknown;
  to: unknown;
  cc: unknown;
  bodyText: string | null;
  receivedAt: Date;
  isAutoReply: boolean;
}

function isFromOwn(row: { from: unknown }, ownAddresses: string[]): boolean {
  const address = firstParticipant(row.from)?.address?.toLowerCase();
  return !!address && ownAddresses.some((own) => own.toLowerCase() === address);
}

/** An inbound message that could call for a reply: not the user's own, not
 * an automatic reply, and not deterministically reply-free (acknowledgement,
 * Cc-only). Only these supersede an earlier message's reply. */
function mayNeedReply(row: ThreadRow, ownAddresses: string[]): boolean {
  return (
    !isFromOwn(row, ownAddresses) &&
    !row.isAutoReply &&
    findNoReplyReason(
      row,
      stripQuotedHistory(row.bodyText ?? ''),
      ownAddresses,
    ) === null
  );
}

/** Whether an earlier inbound message — after the user's last message in
 * the thread — may need a reply. If so, this (newer) message superseded it
 * and must answer the conversation itself. */
function hasUnansweredEarlierInbound(
  message: { id: string; receivedAt: Date; thread: { messages: ThreadRow[] } },
  ownAddresses: string[],
): boolean {
  const earlier = message.thread.messages.filter(
    (other) => other.id !== message.id && other.receivedAt < message.receivedAt,
  );
  const lastOwn = earlier
    .filter((other) => isFromOwn(other, ownAddresses))
    .reduce<Date | null>(
      (latest, other) =>
        !latest || other.receivedAt > latest ? other.receivedAt : latest,
      null,
    );

  return earlier.some(
    (other) =>
      (!lastOwn || other.receivedAt > lastOwn) &&
      mayNeedReply(other, ownAddresses),
  );
}

/** Prisma's unique-constraint violation (P2002), checked structurally so
 * this doesn't depend on the generated client's error class identity. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : JSON.stringify(error);
}

function buildContextInstruction(
  current: ContactMemoryResponse,
  related: ContactMemoryMatch[],
  documentMatches: DocumentChunkMatch[],
  crmContact: ContactModel | null,
  calendarContext: string | null,
): {
  instruction: string | undefined;
  contactMemoryUsed: boolean;
  crmContactUsed: boolean;
  calendarAgentUsed: boolean;
} {
  const sections: string[] = [];

  // The current contact's own accumulated memory — separate from the
  // cross-contact "related" section below. No explicit precedence over the
  // documents section further down: both are shown as-is, and the existing
  // "don't invent facts... not present in the thread or provided context"
  // rule in reply.md is left to arbitrate if the two ever disagree.
  const currentLines: string[] = [];
  if (current.facts.role) currentLines.push(`Role: ${current.facts.role}`);
  if (current.facts.company)
    currentLines.push(`Company: ${current.facts.company}`);
  if (current.facts.summary)
    currentLines.push(`Summary: ${current.facts.summary}`);
  if (current.facts.commitments.length > 0) {
    currentLines.push(`Commitments: ${current.facts.commitments.join('; ')}`);
  }
  if (currentLines.length > 0) {
    sections.push(
      `What we know about this specific sender, from past conversations with them:\n${currentLines.join('\n')}`,
    );
  }

  // related is already scoped to OTHER contacts within a tight similarity
  // distance by ContactMemoryService.searchSimilar — still labeled clearly
  // as background, not as facts about this thread's participants, since a
  // close embedding match doesn't guarantee actual relevance to what's
  // being discussed right now.
  if (related.length > 0) {
    const lines = related.map(
      (match) =>
        `- ${match.senderName ?? match.senderEmail}: ${match.facts.summary}`,
    );
    sections.push(
      `Background only — facts about OTHER people from unrelated past conversations, surfaced because they seemed topically similar. Do not state or imply any of this in the reply unless it is unmistakably about the same matter as the current thread:\n${lines.join('\n')}`,
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

  // Calendar Agent (v3.0 multi-agent orchestration §Option B) — see
  // CalendarContextService for why this never contains a specific time.
  if (calendarContext) {
    sections.push(calendarContext);
  }

  return {
    instruction: sections.length > 0 ? sections.join('\n\n') : undefined,
    contactMemoryUsed: related.length > 0,
    crmContactUsed: !!crmContact,
    calendarAgentUsed: !!calendarContext,
  };
}
