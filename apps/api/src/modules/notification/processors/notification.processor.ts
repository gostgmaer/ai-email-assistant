import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { NotificationJobs, QueueNames } from '../../../infrastructure/queue';
import { NotificationService } from '../services/notification.service';

interface NotificationJobData {
  userId: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

@Processor(QueueNames.Notification)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly notificationService: NotificationService) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    if (job.name !== NotificationJobs.SendEmail) {
      this.logger.warn(`Unknown notification job: ${job.name}`);
      return;
    }

    await this.notificationService.create(
      job.data.userId,
      job.data.title,
      job.data.body,
      job.data.metadata,
    );
  }
}
