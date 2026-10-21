import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../database';
import { NotificationDeliveryJobData } from '../../../infrastructure/queue';
import { MailerService } from '../../../infrastructure/mailer';
// Leaf-file import — see documents.controller.ts's comment for why.
import { IntegrationService } from '../../integration/services/integration.service';

/**
 * Sends a notification out of the app on the channels the user chose
 * (email through the system mailer — never the user's own mailbox — and
 * Slack through one of their Slack integrations). Each channel is
 * best-effort: one failing doesn't stop the other, and nothing is retried
 * forever — the in-app notification is the record.
 */
@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailerService: MailerService,
    private readonly integrationService: IntegrationService,
  ) {}

  async deliver(data: NotificationDeliveryJobData): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: data.userId },
      select: {
        email: true,
        deletedAt: true,
        notificationPreferences: {
          where: { event: data.event, channel: 'SLACK', enabled: true },
        },
      },
    });
    if (!user || user.deletedAt) {
      return;
    }

    for (const channel of data.channels) {
      try {
        if (channel === 'EMAIL') {
          await this.mailerService.sendNotificationEmail(
            user.email,
            data.title,
            data.body,
          );
        }

        if (channel === 'SLACK') {
          const slack = user.notificationPreferences[0];
          if (!slack?.slackIntegrationId || !slack.slackChannelId) {
            continue;
          }
          // Access is re-checked at send time: the user may have lost
          // access to the mailbox the integration belongs to.
          const stillMember = await this.prisma.integration.count({
            where: {
              id: slack.slackIntegrationId,
              account: { members: { some: { userId: data.userId } } },
            },
          });
          if (stillMember === 0) {
            continue;
          }
          await this.integrationService.postMessage(
            slack.slackIntegrationId,
            slack.slackChannelId,
            `*${data.title}*\n${data.body}`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Couldn't deliver "${data.title}" to user ${data.userId} by ${channel}: ${
            error instanceof Error ? error.message : JSON.stringify(error)
          }`,
        );
      }
    }
  }
}
