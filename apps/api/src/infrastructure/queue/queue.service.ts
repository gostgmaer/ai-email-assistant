import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  AIJobs,
  EmailSyncJobs,
  NotificationJobs,
} from './constants/job.constants';
import { QueueNames } from './constants/queue.constants';

const BACKGROUND_SYNC_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue(QueueNames.EmailSync) private readonly emailSyncQueue: Queue,
    @InjectQueue(QueueNames.AI) private readonly aiQueue: Queue,
    @InjectQueue(QueueNames.Notification)
    private readonly notificationQueue: Queue,
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

  getQueue(name: (typeof QueueNames)[keyof typeof QueueNames]): Queue {
    switch (name) {
      case QueueNames.EmailSync:
        return this.emailSyncQueue;
      case QueueNames.AI:
        return this.aiQueue;
      case QueueNames.Notification:
        return this.notificationQueue;
    }
  }
}
