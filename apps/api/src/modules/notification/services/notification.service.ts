import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../database';
import {
  NotificationChannel,
  NotificationEvent,
} from '../../../generated/prisma/enums';
import type { InputJsonValue } from '../../../generated/prisma/internal/prismaNamespace';
import { QueueService } from '../../../infrastructure/queue';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  defaultEnabled,
} from '../notification-events';

export interface NotificationPreferenceInput {
  event: NotificationEvent;
  channel: NotificationChannel;
  enabled: boolean;
  slackIntegrationId?: string | null;
  slackChannelId?: string | null;
}

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Notifies a user about `event` on the channels they chose for it
   * (docs/email-automation-implementation-plan.md §6.2): the in-app row is
   * written here (unless they muted it), and email/Slack delivery is
   * queued. Returns the in-app notification, or null when muted.
   */
  async create(
    userId: string,
    title: string,
    body: string,
    metadata?: Record<string, unknown>,
    event: NotificationEvent = 'AUTOMATION',
  ) {
    const preferences = await this.prisma.notificationPreference.findMany({
      where: { userId, event },
    });
    const enabled = (channel: NotificationChannel) =>
      preferences.find((p) => p.channel === channel)?.enabled ??
      defaultEnabled(channel);

    const notification = enabled('IN_APP')
      ? await this.prisma.notification.create({
          data: {
            userId,
            title,
            body,
            event,
            metadata: metadata as unknown as InputJsonValue,
          },
        })
      : null;

    const external = NOTIFICATION_CHANNELS.filter(
      (channel) => channel !== 'IN_APP' && enabled(channel),
    );
    if (external.length > 0) {
      await this.queueService.enqueueNotificationDelivery({
        userId,
        title,
        body,
        metadata,
        event,
        channels: external,
      });
    }

    return notification;
  }

  /** Every event × channel, with defaults filled in for missing rows. */
  async getPreferences(userId: string) {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId },
    });

    return NOTIFICATION_EVENTS.map(({ event, label }) => ({
      event,
      label,
      channels: NOTIFICATION_CHANNELS.map((channel) => {
        const row = rows.find(
          (r) => r.event === event && r.channel === channel,
        );
        return {
          channel,
          enabled: row?.enabled ?? defaultEnabled(channel),
          slackIntegrationId: row?.slackIntegrationId ?? null,
          slackChannelId: row?.slackChannelId ?? null,
        };
      }),
    }));
  }

  /** Saves the given preferences (others are left as they are). A Slack
   * channel must be on an integration of an account the user can access. */
  async updatePreferences(
    userId: string,
    preferences: NotificationPreferenceInput[],
  ) {
    for (const preference of preferences) {
      if (preference.channel === 'SLACK' && preference.enabled) {
        if (!preference.slackIntegrationId || !preference.slackChannelId) {
          throw new BadRequestException(
            'Slack notifications need a Slack workspace and channel',
          );
        }
        await this.assertSlackAccess(userId, preference.slackIntegrationId);
      }
    }

    await this.prisma.$transaction(
      preferences.map((preference) =>
        this.prisma.notificationPreference.upsert({
          where: {
            userId_event_channel: {
              userId,
              event: preference.event,
              channel: preference.channel,
            },
          },
          create: { userId, ...preference },
          update: {
            enabled: preference.enabled,
            slackIntegrationId: preference.slackIntegrationId,
            slackChannelId: preference.slackChannelId,
          },
        }),
      ),
    );

    return this.getPreferences(userId);
  }

  async assertSlackAccess(userId: string, integrationId: string) {
    const integration = await this.prisma.integration.findUnique({
      where: { id: integrationId },
      select: {
        provider: true,
        account: { select: { members: { where: { userId } } } },
      },
    });
    if (
      !integration ||
      integration.provider !== 'SLACK' ||
      integration.account.members.length === 0
    ) {
      throw new BadRequestException(
        'That Slack workspace is not connected to a mailbox you can access',
      );
    }
  }

  async listForUser(
    userId: string,
    options: { page?: number; limit?: number; unreadOnly?: boolean } = {},
  ) {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;

    const where = {
      userId,
      ...(options.unreadOnly ? { isRead: false } : {}),
    };

    const [notifications, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      notifications,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException(
        'You do not have access to this notification',
      );
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
