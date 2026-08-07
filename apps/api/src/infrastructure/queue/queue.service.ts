import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  AIJobs,
  DigestJobs,
  DocumentJobs,
  EmailSyncJobs,
  NotificationJobs,
} from './constants/job.constants';
import { QueueNames } from './constants/queue.constants';

const BACKGROUND_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const DOCUMENT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
// 08:00 daily — this codebase's first cron-pattern repeatable job (every
// other scheduled job so far uses a fixed `every` interval instead).
const DAILY_DIGEST_CRON = '0 8 * * *';

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
  ) {}

  async enqueueInitialSync(accountId: string): Promise<void> {
    // See enqueueAiProcessing: BullMQ rejects a custom jobId containing a
    // colon unless it splits into exactly 3 parts, so use a dash here.
    await this.emailSyncQueue.add(
      EmailSyncJobs.InitialSync,
      { accountId },
      { jobId: `${EmailSyncJobs.InitialSync}-${accountId}` },
    );
  }

  async enqueueIncrementalSync(accountId: string): Promise<void> {
    await this.emailSyncQueue.add(
      EmailSyncJobs.IncrementalSync,
      { accountId },
      { jobId: `${EmailSyncJobs.IncrementalSync}:${accountId}:${Date.now()}` },
    );
  }

  async enqueueAiProcessing(messageId: string): Promise<void> {
    // BullMQ only allows a colon in a custom jobId when it splits into
    // exactly 3 parts (legacy repeatable-job format) — use a dash instead
    // to avoid tripping that check.
    await this.aiQueue.add(
      AIJobs.ProcessMessage,
      { messageId },
      { jobId: `${AIJobs.ProcessMessage}-${messageId}` },
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
  ): Promise<void> {
    await this.notificationQueue.add(NotificationJobs.SendEmail, {
      userId,
      title,
      body,
      metadata,
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
    }
  }
}
