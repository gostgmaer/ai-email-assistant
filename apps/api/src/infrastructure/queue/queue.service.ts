import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  AIJobs,
  ApprovalJobs,
  AutomationJobs,
  DigestJobs,
  DocumentJobs,
  EmailSyncJobs,
  NotificationJobs,
  SearchIndexJobs,
} from './constants/job.constants';
import { QueueNames } from './constants/queue.constants';
import {
  NotificationChannel,
  NotificationEvent,
} from '../../generated/prisma/enums';

const BACKGROUND_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const DOCUMENT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
// Top of every hour: the digest job sends to the users whose own local
// time is their chosen digest hour (User.timezone / digestHour).
const DAILY_DIGEST_CRON = '0 * * * *';
const APPROVAL_SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const RULE_EXECUTION_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FOLLOW_UP_SCAN_INTERVAL_MS = 60 * 60 * 1000;
const TRIAGE_SCAN_INTERVAL_MS = 5 * 60 * 1000;
const COMMITMENT_SCAN_INTERVAL_MS = 5 * 60 * 1000;
// New mail is searchable in "Ask your inbox" within about a minute.
const SEARCH_INDEX_SCAN_INTERVAL_MS = 60 * 1000;

/** Everything DocumentsProcessingProcessor needs to call the AI service and
 * update the Document row, without re-querying the DB or re-deriving the
 * uploader's identity for the file-upload-service HMAC headers.
 *
 * No workspaceId — this app has no workspace concept, and a fabricated one
 * would carry zero real meaning. tenantId maps to the file-upload-service
 * tenant (not a per-user tenant — this app remains single-tenant). */
export interface DocumentProcessingJobPayload {
  documentId: string;
  tenantId: string;
  uploadedBy: string;
  userEmail: string;
  userRole: string;
  fileId: string;
  originalFileName: string;
  extension: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
  uploadTimestamp: string;
  language?: string;
  metadata?: Record<string, unknown>;
  priority?: number;
}

export interface NotificationDeliveryJobData {
  userId: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  event: NotificationEvent;
  channels: NotificationChannel[];
}

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue(QueueNames.EmailSync) private readonly emailSyncQueue: Queue,
    @InjectQueue(QueueNames.AI) private readonly aiQueue: Queue,
    @InjectQueue(QueueNames.Notification)
    private readonly notificationQueue: Queue,
    @InjectQueue(QueueNames.Documents)
    private readonly documentsQueue: Queue,
    @InjectQueue(QueueNames.Digest) private readonly digestQueue: Queue,
    @InjectQueue(QueueNames.Approvals)
    private readonly approvalsQueue: Queue,
    @InjectQueue(QueueNames.Automation)
    private readonly automationQueue: Queue,
    @InjectQueue(QueueNames.SearchIndex)
    private readonly searchIndexQueue: Queue,
  ) {}

  async enqueueInitialSync(accountId: string): Promise<void> {
    // See enqueueAiProcessing: BullMQ rejects a custom jobId containing a
    // colon unless it splits into exactly 3 parts, so use a dash here.
    // Removed as soon as it finishes either way: a finished job kept under
    // this fixed id would make a later reconnect's enqueue a silent no-op
    // (BullMQ ignores an add whose jobId already exists). Failures are
    // recorded on the account itself (syncStatus/lastSyncError).
    await this.emailSyncQueue.add(
      EmailSyncJobs.InitialSync,
      { accountId },
      {
        jobId: `${EmailSyncJobs.InitialSync}-${accountId}`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  async enqueueIncrementalSync(accountId: string): Promise<void> {
    // One fixed id per account: while a sync for the account is queued or
    // running, another add is a no-op, so overlapping syncs can't race on
    // the same rows. A single attempt — EmailSyncService does its own
    // backoff via nextSyncAt, and the background scan is the retry.
    await this.emailSyncQueue.add(
      EmailSyncJobs.IncrementalSync,
      { accountId },
      {
        jobId: `${EmailSyncJobs.IncrementalSync}-${accountId}`,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  /**
   * `retry` re-queues a message whose earlier job already finished (the
   * "Retry AI" action): BullMQ silently ignores an add whose jobId still
   * exists in the completed/failed sets, so the old job is removed first.
   * A job that's still waiting or running is left alone either way.
   */
  async enqueueAiProcessing(
    messageId: string,
    options: { retry?: boolean; delayMs?: number } = {},
  ): Promise<void> {
    // BullMQ only allows a colon in a custom jobId when it splits into
    // exactly 3 parts (legacy repeatable-job format) — use a dash instead
    // to avoid tripping that check.
    const jobId = `${AIJobs.ProcessMessage}-${messageId}`;

    if (options.retry) {
      const existing = await this.aiQueue.getJob(jobId);
      const state = await existing?.getState();
      if (existing && (state === 'failed' || state === 'completed')) {
        await existing.remove();
      }
    }

    await this.aiQueue.add(
      AIJobs.ProcessMessage,
      { messageId },
      options.delayMs ? { jobId, delay: options.delayMs } : { jobId },
    );
  }

  async enqueueFolderSync(accountId: string): Promise<void> {
    await this.emailSyncQueue.add(
      EmailSyncJobs.SyncFolders,
      { accountId },
      { jobId: `${EmailSyncJobs.SyncFolders}-${accountId}` },
    );
  }

  /** Idempotent: registers the recurring background-sync scan if not already scheduled. */
  async scheduleBackgroundSync(): Promise<void> {
    await this.emailSyncQueue.upsertJobScheduler(
      'background-sync-scan',
      { every: BACKGROUND_SYNC_INTERVAL_MS },
      { name: EmailSyncJobs.BackgroundScan, data: {} },
    );
  }

  /** Idempotent: registers the recurring stale-document cleanup scan if not
   * already scheduled. Redis-backed, so this is safe to call from every
   * process (api + worker) on startup without double-scheduling. */
  async scheduleDocumentCleanup(): Promise<void> {
    await this.documentsQueue.upsertJobScheduler(
      'document-cleanup-scan',
      { every: DOCUMENT_CLEANUP_INTERVAL_MS },
      { name: DocumentJobs.CleanupStale, data: {} },
    );
  }

  async enqueueDocumentProcessing(
    payload: DocumentProcessingJobPayload,
  ): Promise<void> {
    await this.documentsQueue.add(DocumentJobs.Process, payload, {
      jobId: `${DocumentJobs.Process}-${payload.documentId}`,
      priority: payload.priority,
    });
  }

  async enqueueNotification(
    userId: string,
    title: string,
    body: string,
    metadata?: Record<string, unknown>,
    event?: NotificationEvent,
  ): Promise<void> {
    await this.notificationQueue.add(NotificationJobs.SendEmail, {
      userId,
      title,
      body,
      metadata,
      event,
    });
  }

  async enqueueNotificationDelivery(
    data: NotificationDeliveryJobData,
  ): Promise<void> {
    await this.notificationQueue.add(NotificationJobs.Deliver, data, {
      attempts: 2,
    });
  }

  /** Idempotent: registers the recurring daily digest build if not already
   * scheduled. Redis-backed, so this is safe to call from every process
   * (api + worker) on startup without double-scheduling. */
  async scheduleDailyDigest(): Promise<void> {
    await this.digestQueue.upsertJobScheduler(
      'daily-digest-build',
      { pattern: DAILY_DIGEST_CRON },
      { name: DigestJobs.BuildAll, data: {} },
    );
  }

  /** Idempotent: registers the recurring approval-chain sweep (reminders
   * and expiry) if not already scheduled. */
  async scheduleApprovalSweep(): Promise<void> {
    await this.approvalsQueue.upsertJobScheduler(
      'approval-chain-sweep',
      { every: APPROVAL_SWEEP_INTERVAL_MS },
      { name: ApprovalJobs.Sweep, data: {} },
    );
  }

  /** Sends a scheduled auto-reply draft at `sendAt`. One job per draft;
   * cancelling doesn't remove it — the job re-checks the send's status
   * when it fires and does nothing if it was cancelled. */
  async enqueueScheduledSend(
    draftMessageId: string,
    sendAt: Date,
  ): Promise<void> {
    await this.automationQueue.add(
      AutomationJobs.SendScheduledReply,
      { draftMessageId },
      {
        jobId: `${AutomationJobs.SendScheduledReply}-${draftMessageId}`,
        delay: Math.max(0, sendAt.getTime() - Date.now()),
      },
    );
  }

  /**
   * Wakes a snoozed thread at `until`. One job per thread: re-snoozing
   * replaces the earlier job. The job also re-checks snoozedUntil when it
   * fires, so a job that couldn't be removed (already running) is harmless.
   */
  async enqueueSnoozeWake(threadId: string, until: Date): Promise<void> {
    await this.cancelSnoozeWake(threadId);
    await this.automationQueue.add(
      AutomationJobs.SnoozeWake,
      { threadId, until: until.toISOString() },
      {
        jobId: `${AutomationJobs.SnoozeWake}-${threadId}`,
        delay: Math.max(0, until.getTime() - Date.now()),
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  async cancelSnoozeWake(threadId: string): Promise<void> {
    const existing = await this.automationQueue.getJob(
      `${AutomationJobs.SnoozeWake}-${threadId}`,
    );
    if (existing && (await existing.getState()) !== 'active') {
      await existing.remove();
    }
  }

  /** Idempotent: registers the hourly follow-up reminder scan. */
  async scheduleFollowUpScan(): Promise<void> {
    await this.automationQueue.upsertJobScheduler(
      'follow-up-scan',
      { every: FOLLOW_UP_SCAN_INTERVAL_MS },
      { name: AutomationJobs.FollowUpScan, data: {} },
    );
  }

  /** Idempotent: registers the smart-triage backfill scan. */
  async scheduleTriageScan(): Promise<void> {
    await this.automationQueue.upsertJobScheduler(
      'triage-scan',
      { every: TRIAGE_SCAN_INTERVAL_MS },
      { name: AutomationJobs.TriageScan, data: {} },
    );
  }

  /** Idempotent: registers the commitment scan over recent sent mail. */
  async scheduleCommitmentScan(): Promise<void> {
    await this.automationQueue.upsertJobScheduler(
      'commitment-scan',
      { every: COMMITMENT_SCAN_INTERVAL_MS },
      { name: AutomationJobs.CommitmentScan, data: {} },
    );
  }

  /** Idempotent: registers the recurring "Ask your inbox" indexing scan. */
  async scheduleSearchIndexScan(): Promise<void> {
    await this.searchIndexQueue.upsertJobScheduler(
      'search-index-scan',
      { every: SEARCH_INDEX_SCAN_INTERVAL_MS },
      { name: SearchIndexJobs.Scan, data: {} },
    );
  }

  /** Idempotent: registers the daily RuleExecution retention cleanup. */
  async scheduleRuleExecutionCleanup(): Promise<void> {
    await this.automationQueue.upsertJobScheduler(
      'rule-execution-cleanup',
      { every: RULE_EXECUTION_CLEANUP_INTERVAL_MS },
      { name: AutomationJobs.CleanupRuleExecutions, data: {} },
    );
  }

  async enqueueDigestForUser(userId: string): Promise<void> {
    await this.digestQueue.add(
      DigestJobs.SendForUser,
      { userId },
      { jobId: `${DigestJobs.SendForUser}-${userId}-${Date.now()}` },
    );
  }

  getQueue(name: (typeof QueueNames)[keyof typeof QueueNames]): Queue {
    switch (name) {
      case QueueNames.EmailSync:
        return this.emailSyncQueue;
      case QueueNames.AI:
        return this.aiQueue;
      case QueueNames.Notification:
        return this.notificationQueue;
      case QueueNames.Documents:
        return this.documentsQueue;
      case QueueNames.Digest:
        return this.digestQueue;
      case QueueNames.Approvals:
        return this.approvalsQueue;
      case QueueNames.Automation:
        return this.automationQueue;
      case QueueNames.SearchIndex:
        return this.searchIndexQueue;
    }
  }
}
