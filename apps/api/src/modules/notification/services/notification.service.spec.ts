import { BadRequestException } from '@nestjs/common';

import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  const userId = 'user-1';

  function buildDeps(preferences: Record<string, unknown>[] = []) {
    const prisma = {
      notificationPreference: {
        findMany: jest.fn().mockResolvedValue(preferences),
        upsert: jest.fn().mockResolvedValue({}),
      },
      notification: { create: jest.fn().mockResolvedValue({ id: 'n1' }) },
      integration: { findUnique: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    const queueService = { enqueueNotificationDelivery: jest.fn() };
    const service = new NotificationService(
      prisma as never,
      queueService as never,
    );
    return { service, prisma, queueService };
  }

  describe('create', () => {
    it('defaults to in-app only', async () => {
      const { service, prisma, queueService } = buildDeps();

      const result = await service.create(
        userId,
        'T',
        'B',
        undefined,
        'DIGEST',
      );

      expect(result).toEqual({ id: 'n1' });
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ event: 'DIGEST' }) as unknown,
      });
      expect(queueService.enqueueNotificationDelivery).not.toHaveBeenCalled();
    });

    it('queues email and Slack delivery for the channels the user turned on', async () => {
      const { service, queueService } = buildDeps([
        { event: 'URGENT_MAIL', channel: 'EMAIL', enabled: true },
        { event: 'URGENT_MAIL', channel: 'SLACK', enabled: true },
      ]);

      await service.create(userId, 'Urgent', 'Body', { a: 1 }, 'URGENT_MAIL');

      expect(queueService.enqueueNotificationDelivery).toHaveBeenCalledWith({
        userId,
        title: 'Urgent',
        body: 'Body',
        metadata: { a: 1 },
        event: 'URGENT_MAIL',
        channels: ['EMAIL', 'SLACK'],
      });
    });

    it('writes no in-app row when the user muted it, but still delivers elsewhere', async () => {
      const { service, prisma, queueService } = buildDeps([
        { event: 'DRAFT_READY', channel: 'IN_APP', enabled: false },
        { event: 'DRAFT_READY', channel: 'EMAIL', enabled: true },
      ]);

      const result = await service.create(
        userId,
        'Draft',
        'Body',
        undefined,
        'DRAFT_READY',
      );

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(queueService.enqueueNotificationDelivery).toHaveBeenCalledTimes(1);
    });
  });

  describe('preferences', () => {
    it('fills in defaults for every event and channel', async () => {
      const { service } = buildDeps([
        { event: 'DIGEST', channel: 'EMAIL', enabled: true },
      ]);

      const preferences = await service.getPreferences(userId);
      const digest = preferences.find((p) => p.event === 'DIGEST');

      expect(preferences).toHaveLength(9);
      expect(digest?.channels).toEqual([
        expect.objectContaining({ channel: 'IN_APP', enabled: true }),
        expect.objectContaining({ channel: 'EMAIL', enabled: true }),
        expect.objectContaining({ channel: 'SLACK', enabled: false }),
      ]);
    });

    it('refuses a Slack channel on a workspace the user has no access to', async () => {
      const { service, prisma } = buildDeps();
      prisma.integration.findUnique.mockResolvedValue({
        provider: 'SLACK',
        account: { members: [] },
      });

      await expect(
        service.updatePreferences(userId, [
          {
            event: 'URGENT_MAIL',
            channel: 'SLACK',
            enabled: true,
            slackIntegrationId: 'someone-elses',
            slackChannelId: 'C1',
          },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.notificationPreference.upsert).not.toHaveBeenCalled();
    });
  });
});

describe('NotificationDeliveryService', () => {
  function buildDeps(slack: Record<string, unknown> | null, member = 1) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          email: 'me@example.com',
          deletedAt: null,
          notificationPreferences: slack ? [slack] : [],
        }),
      },
      integration: { count: jest.fn().mockResolvedValue(member) },
    };
    const mailerService = {
      sendNotificationEmail: jest
        .fn()
        .mockRejectedValue(new Error('SMTP down')),
    };
    const integrationService = { postMessage: jest.fn() };
    const service = new NotificationDeliveryService(
      prisma as never,
      mailerService as never,
      integrationService as never,
    );
    return { service, mailerService, integrationService };
  }

  const job = {
    userId: 'user-1',
    title: 'Urgent email',
    body: 'Body',
    event: 'URGENT_MAIL' as const,
    channels: ['EMAIL' as const, 'SLACK' as const],
  };

  it('posts to Slack even when the email channel fails', async () => {
    const { service, mailerService, integrationService } = buildDeps({
      slackIntegrationId: 'int-1',
      slackChannelId: 'C1',
    });

    await service.deliver(job);

    expect(mailerService.sendNotificationEmail).toHaveBeenCalledWith(
      'me@example.com',
      'Urgent email',
      'Body',
    );
    expect(integrationService.postMessage).toHaveBeenCalledWith(
      'int-1',
      'C1',
      '*Urgent email*\nBody',
    );
  });

  it('skips Slack once the user lost access to that mailbox', async () => {
    const { service, integrationService } = buildDeps(
      { slackIntegrationId: 'int-1', slackChannelId: 'C1' },
      0,
    );

    await service.deliver(job);

    expect(integrationService.postMessage).not.toHaveBeenCalled();
  });
});
