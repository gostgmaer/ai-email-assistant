import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { NotificationEvent } from '../../../generated/prisma/enums';
import {
  NotificationDeliveryJobData,
  NotificationJobs,
  QueueNames,
} from '../../../infrastructure/queue';
import { NotificationDeliveryService } from '../services/notification-delivery.service';
import { NotificationService } from '../services/notification.service';

interface NotificationJobData {
  userId: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  event?: NotificationEvent;
}

@Processor(QueueNames.Notification)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly deliveryService: NotificationDeliveryService,
  ) {
    super();
  }

  async process(
    job: Job<NotificationJobData | NotificationDeliveryJobData>,
  ): Promise<void> {
    switch (job.name) {
      case NotificationJobs.SendEmail: {
        // Despite the name, "create a notification" (in-app + channels).
        const data: NotificationJobData = job.data;
        await this.notificationService.create(
          data.userId,
          data.title,
          data.body,
          data.metadata,
          data.event,
        );
        return;
      }
      case NotificationJobs.Deliver:
        await this.deliveryService.deliver(
          job.data as NotificationDeliveryJobData,
        );
        return;
      default:
        this.logger.warn(`Unknown notification job: ${job.name}`);
    }
  }
}
