import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { PrismaService } from '../../../database';
import {
  EmailSyncJobs,
  QueueNames,
  QueueService,
} from '../../../infrastructure/queue';
import { EmailSyncService } from '../services/email-sync.service';

interface EmailSyncJobData {
  accountId?: string;
}

@Processor(QueueNames.EmailSync)
export class EmailSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailSyncProcessor.name);

  constructor(
    private readonly emailSyncService: EmailSyncService,
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {
    super();
  }

  async process(job: Job<EmailSyncJobData>): Promise<void> {
    switch (job.name) {
      case EmailSyncJobs.InitialSync:
        await this.emailSyncService.syncAccount(
          this.requireAccountId(job),
          'full',
        );
        return;
      case EmailSyncJobs.IncrementalSync:
        await this.emailSyncService.syncAccount(
          this.requireAccountId(job),
          'incremental',
        );
        return;
      case EmailSyncJobs.SyncFolders:
        await this.emailSyncService.syncFoldersOnly(this.requireAccountId(job));
        return;
      case EmailSyncJobs.BackgroundScan:
        await this.runBackgroundScan();
        return;
      default:
        this.logger.warn(`Unknown email-sync job: ${job.name}`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<EmailSyncJobData>, error: Error): void {
    this.logger.warn(
      `Email sync job ${job.id} (${job.name}) for account ${job.data.accountId ?? 'n/a'} failed: ${error.message}`,
    );
  }

  private requireAccountId(job: Job<EmailSyncJobData>): string {
    if (!job.data.accountId) {
      throw new Error(`Job ${job.name} is missing accountId`);
    }

    return job.data.accountId;
  }

  private async runBackgroundScan(): Promise<void> {
    const accounts = await this.prisma.emailAccount.findMany({
      where: { syncEnabled: true, deletedAt: null },
      select: { id: true },
    });

    for (const account of accounts) {
      await this.queueService.enqueueIncrementalSync(account.id);
    }
  }
}
