import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { PrismaService } from '../../../database';
import {
  DigestJobs,
  QueueNames,
  QueueService,
} from '../../../infrastructure/queue';
import { NotificationService } from '../../notification';

interface DigestJobData {
  userId?: string;
}

/**
 * Data-only digest for v1 — an aggregation, not an LLM-generated narrative
 * (see docs/v1.2-plan.md's open decision on this). Reuses the existing
 * in-app Notification model rather than sending a real email, consistent
 * with how NotificationJobs.SendEmail already just creates a Notification
 * row despite its name.
 */
@Processor(QueueNames.Digest)
export class DigestProcessor extends WorkerHost {
  private readonly logger = new Logger(DigestProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly notificationService: NotificationService,
  ) {
    super();
  }

  async process(job: Job<DigestJobData>): Promise<void> {
    switch (job.name) {
      case DigestJobs.BuildAll:
        await this.buildAll();
        return;
      case DigestJobs.SendForUser:
        await this.sendForUser(this.requireUserId(job));
        return;
      default:
        this.logger.warn(`Unknown digest job: ${job.name}`);
    }
  }

  private requireUserId(job: Job<DigestJobData>): string {
    if (!job.data.userId) {
      throw new Error(`Job ${job.name} is missing userId`);
    }
    return job.data.userId;
  }

  private async buildAll(): Promise<void> {
    const accounts = await this.prisma.emailAccount.findMany({
      where: { deletedAt: null },
      select: { userId: true },
      distinct: ['userId'],
    });

    for (const account of accounts) {
      await this.queueService.enqueueDigestForUser(account.userId);
    }
  }

  private async sendForUser(userId: string): Promise<void> {
    const [unreadCount, priorityCount, pendingTaskCount] = await Promise.all([
      this.prisma.emailMessage.count({
        where: {
          isRead: false,
          thread: { folder: { type: 'INBOX' }, account: { userId } },
        },
      }),
      this.prisma.emailMessage.count({
        where: {
          isRead: false,
          priority: { in: ['High', 'high', 'Urgent', 'urgent'] },
          thread: { folder: { type: 'INBOX' }, account: { userId } },
        },
      }),
      this.prisma.task.count({ where: { userId, status: 'PENDING' } }),
    ]);

    if (unreadCount === 0 && pendingTaskCount === 0) {
      // Nothing to report — skip creating an empty digest notification.
      return;
    }

    const parts = [
      `${unreadCount} unread email${unreadCount === 1 ? '' : 's'}`,
    ];
    if (priorityCount > 0) {
      parts.push(`${priorityCount} high priority`);
    }
    if (pendingTaskCount > 0) {
      parts.push(
        `${pendingTaskCount} pending task${pendingTaskCount === 1 ? '' : 's'}`,
      );
    }

    await this.notificationService.create(
      userId,
      'Your daily digest',
      parts.join(' · '),
      { type: 'daily-digest', unreadCount, priorityCount, pendingTaskCount },
    );
  }
}
