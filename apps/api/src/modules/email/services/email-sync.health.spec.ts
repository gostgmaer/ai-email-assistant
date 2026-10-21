import { ConfigService } from '@nestjs/config';
import { UnrecoverableError } from 'bullmq';

import { PrismaService } from '../../../database';
import { QueueService } from '../../../infrastructure/queue';
import { EmailAccountService } from '../../email-account';
import { OAuthReconnectRequiredException } from '../../oauth';
import {
  FolderChangeSet,
  MailProviderClient,
  NormalizedMessage,
} from '../interfaces';
import {
  MailAuthError,
  MailRateLimitError,
  SyncCursorExpiredError,
} from '../providers/mail-errors';
import { MailProviderFactory } from '../providers/mail-provider.factory';
import { EmailSyncService } from './email-sync.service';

/**
 * Phase 2 of docs/email-automation-implementation-plan.md: change-cursor
 * sync, per-message failure isolation, account health/backoff, aliases and
 * thread metadata ordering.
 */
describe('EmailSyncService — change tracking and sync health', () => {
  const accountId = 'account-1';
  const MINUTE_MS = 60 * 1000;

  function message(
    id: string,
    overrides: Partial<NormalizedMessage> = {},
  ): NormalizedMessage {
    return {
      providerMessageId: id,
      providerThreadId: `thread-${id}`,
      subject: `Subject ${id}`,
      from: [{ address: 'sender@example.com' }],
      to: [{ address: 'user@example.com' }],
      receivedAt: new Date(),
      isRead: false,
      bulkMailSignals: {
        automated: false,
        marketing: false,
        otp: false,
        passwordReset: false,
        billing: false,
        shipping: false,
        calendar: false,
        autoReply: false,
      },
      ...overrides,
    };
  }

  function buildAccount(overrides: Record<string, unknown> = {}) {
    return {
      id: accountId,
      userId: 'user-1',
      email: 'user@example.com',
      syncEnabled: true,
      deletedAt: null,
      filterMarketing: true,
      filterOtp: true,
      filterPasswordReset: true,
      filterBilling: true,
      filterShipping: true,
      filterCalendar: true,
      aiEnabledFrom: new Date(0),
      aliases: [] as string[],
      aliasesRefreshedAt: new Date(),
      consecutiveSyncFailures: 0,
      syncStatus: 'IDLE',
      ...overrides,
    };
  }

  function buildPrisma(
    account = buildAccount(),
    folderOverrides: Record<string, unknown> = {},
  ) {
    const folder = {
      id: 'folder-1',
      accountId,
      providerFolderId: 'INBOX',
      name: 'Inbox',
      type: 'INBOX',
      syncCursor: 'cursor-1',
      ...folderOverrides,
    };

    return {
      folder,
      emailAccount: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(account),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...account, ...data }),
        ),
      },
      mailFolder: {
        upsert: jest.fn().mockResolvedValue(folder),
        update: jest.fn(),
      },
      emailThread: {
        upsert: jest.fn().mockResolvedValue({ id: 'thread-row-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        delete: jest.fn(),
      },
      emailMessage: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({ id: 'message-row-1' }),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
    };
  }

  function buildClient(
    overrides: Partial<MailProviderClient> = {},
  ): jest.Mocked<MailProviderClient> {
    return {
      listFolders: jest
        .fn()
        .mockResolvedValue([
          { providerFolderId: 'INBOX', name: 'Inbox', type: 'INBOX' },
        ]),
      listMessages: jest.fn().mockResolvedValue({ messages: [] }),
      getMessage: jest.fn((id: string) => Promise.resolve(message(id))),
      sendMessage: jest.fn(),
      markAsRead: jest.fn(),
      getChangeCursor: jest.fn().mockResolvedValue('fresh-cursor'),
      listChanges: jest.fn().mockResolvedValue({
        upserted: [],
        removed: [],
        nextCursor: 'cursor-2',
      } satisfies FolderChangeSet),
      ...overrides,
    } as jest.Mocked<MailProviderClient>;
  }

  function buildService(
    prisma: ReturnType<typeof buildPrisma>,
    client: MailProviderClient,
  ) {
    const emailAccountService = {
      markSyncStarted: jest.fn(),
      markSyncCompleted: jest.fn(),
      markSyncFailed: jest.fn(),
    };
    const queueService = {
      enqueueNotification: jest.fn(),
      enqueueAiProcessing: jest.fn(),
    };
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    const service = new EmailSyncService(
      prisma as unknown as PrismaService,
      emailAccountService as unknown as EmailAccountService,
      {
        createClient: jest.fn().mockResolvedValue(client),
      } as unknown as MailProviderFactory,
      queueService as unknown as QueueService,
      configService,
    );

    return { service, emailAccountService, queueService };
  }

  describe('change-cursor sync', () => {
    it('fetches only unknown messages, updates read state of known ones, mirrors deletes, and stores the next cursor', async () => {
      const prisma = buildPrisma();
      prisma.emailMessage.findFirst.mockImplementation(
        ({ where }: { where: { providerMessageId: string } }) =>
          Promise.resolve(
            where.providerMessageId === 'known'
              ? { id: 'known-row', isRead: false }
              : null,
          ),
      );
      prisma.emailMessage.findMany.mockResolvedValue([
        { id: 'gone-row', threadId: 'gone-thread' },
      ]);
      const client = buildClient({
        listChanges: jest.fn().mockResolvedValue({
          upserted: [
            { providerMessageId: 'new', isRead: false },
            { providerMessageId: 'known', isRead: true },
          ],
          removed: ['gone'],
          nextCursor: 'cursor-2',
        }),
      });
      const { service, queueService } = buildService(prisma, client);

      await service.syncAccount(accountId, 'incremental');

      expect(client.listChanges).toHaveBeenCalledWith('INBOX', 'cursor-1');
      expect(client.getMessage).toHaveBeenCalledTimes(1);
      expect(client.getMessage).toHaveBeenCalledWith('new', 'INBOX');
      expect(prisma.emailMessage.update).toHaveBeenCalledWith({
        where: { id: 'known-row' },
        data: { isRead: true },
      });
      expect(prisma.emailMessage.delete).toHaveBeenCalledWith({
        where: { id: 'gone-row' },
      });
      // The deleted message was the thread's last one.
      expect(prisma.emailThread.delete).toHaveBeenCalledWith({
        where: { id: 'gone-thread' },
      });
      expect(prisma.mailFolder.update).toHaveBeenCalledWith({
        where: { id: 'folder-1' },
        data: { syncCursor: 'cursor-2' },
      });
      expect(queueService.enqueueAiProcessing).toHaveBeenCalledTimes(1);
      expect(client.listMessages).not.toHaveBeenCalled();
    });

    it('re-baselines an expired cursor: takes a fresh cursor BEFORE listing the newest messages', async () => {
      const prisma = buildPrisma();
      const calls: string[] = [];
      const client = buildClient({
        listChanges: jest
          .fn()
          .mockRejectedValue(new SyncCursorExpiredError('too old')),
        getChangeCursor: jest.fn(() => {
          calls.push('cursor');
          return Promise.resolve('fresh-cursor');
        }),
        listMessages: jest.fn(() => {
          calls.push('list');
          return Promise.resolve({ messages: [message('m1')] });
        }),
      });
      const { service } = buildService(prisma, client);

      await service.syncAccount(accountId, 'incremental');

      expect(calls).toEqual(['cursor', 'list']);
      expect(prisma.emailMessage.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.mailFolder.update).toHaveBeenCalledWith({
        where: { id: 'folder-1' },
        data: { syncCursor: 'fresh-cursor' },
      });
    });

    it('baselines a folder that has no cursor yet (accounts synced before cursors existed)', async () => {
      const prisma = buildPrisma(buildAccount(), { syncCursor: null });
      const client = buildClient();
      const { service } = buildService(prisma, client);

      await service.syncAccount(accountId, 'incremental');

      expect(client.listChanges).not.toHaveBeenCalled();
      expect(client.getChangeCursor).toHaveBeenCalledWith('INBOX');
      expect(client.listMessages).toHaveBeenCalled();
    });

    it('skips a message that fails on its own instead of failing the whole sync', async () => {
      const prisma = buildPrisma();
      const client = buildClient({
        listChanges: jest.fn().mockResolvedValue({
          upserted: [
            { providerMessageId: 'broken' },
            { providerMessageId: 'fine' },
          ],
          removed: [],
          nextCursor: 'cursor-2',
        }),
        getMessage: jest.fn((id: string) =>
          id === 'broken'
            ? Promise.reject(new Error('malformed MIME'))
            : Promise.resolve(message(id)),
        ),
      });
      const { service, emailAccountService } = buildService(prisma, client);

      await service.syncAccount(accountId, 'incremental');

      expect(prisma.emailMessage.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.mailFolder.update).toHaveBeenCalledWith({
        where: { id: 'folder-1' },
        data: { syncCursor: 'cursor-2' },
      });
      expect(emailAccountService.markSyncCompleted).toHaveBeenCalledWith(
        accountId,
        expect.stringContaining('1 message(s) in Inbox'),
      );
    });
  });

  describe('account health', () => {
    it('stops on a credential failure: AUTH_REQUIRED, one notification, and no BullMQ retry', async () => {
      const prisma = buildPrisma();
      const client = buildClient({
        listFolders: jest
          .fn()
          .mockRejectedValue(new MailAuthError('token revoked')),
      });
      const { service, emailAccountService, queueService } = buildService(
        prisma,
        client,
      );

      await expect(
        service.syncAccount(accountId, 'incremental'),
      ).rejects.toBeInstanceOf(UnrecoverableError);

      expect(emailAccountService.markSyncFailed).toHaveBeenCalledWith(
        accountId,
        'token revoked',
        { status: 'AUTH_REQUIRED', consecutiveFailures: 1, nextSyncAt: null },
      );
      expect(queueService.enqueueNotification).toHaveBeenCalledWith(
        'user-1',
        'Reconnect your mailbox',
        expect.any(String),
        { accountId },
        'SYNC_FAILED',
      );
    });

    it('treats a rejected OAuth refresh as a credential failure too', async () => {
      const prisma = buildPrisma();
      const client = buildClient();
      const { service, emailAccountService } = buildService(prisma, client);
      (
        service as unknown as {
          mailProviderFactory: { createClient: jest.Mock };
        }
      ).mailProviderFactory.createClient.mockRejectedValue(
        new OAuthReconnectRequiredException('invalid_grant'),
      );

      await expect(
        service.syncAccount(accountId, 'incremental'),
      ).rejects.toBeInstanceOf(UnrecoverableError);
      expect(emailAccountService.markSyncFailed).toHaveBeenCalledWith(
        accountId,
        'invalid_grant',
        expect.objectContaining({ status: 'AUTH_REQUIRED' }),
      );
    });

    it('does not notify again for an account already waiting on a reconnect', async () => {
      const prisma = buildPrisma(buildAccount({ syncStatus: 'AUTH_REQUIRED' }));
      const client = buildClient({
        listFolders: jest
          .fn()
          .mockRejectedValue(new MailAuthError('still revoked')),
      });
      const { service, queueService } = buildService(prisma, client);

      await expect(
        service.syncAccount(accountId, 'incremental'),
      ).rejects.toThrow();

      expect(queueService.enqueueNotification).not.toHaveBeenCalled();
    });

    it('backs off exponentially on transient failures and notifies only when they reach the threshold', async () => {
      const failures = [0, 1, 2];
      const nextSyncDelays: number[] = [];
      const notifications: number[] = [];

      for (const previousFailures of failures) {
        const prisma = buildPrisma(
          buildAccount({ consecutiveSyncFailures: previousFailures }),
        );
        const client = buildClient({
          listFolders: jest.fn().mockRejectedValue(new Error('ECONNRESET')),
        });
        const { service, emailAccountService, queueService } = buildService(
          prisma,
          client,
        );

        await expect(
          service.syncAccount(accountId, 'incremental'),
        ).rejects.toThrow('ECONNRESET');

        const health = emailAccountService.markSyncFailed.mock.calls[0][2] as {
          status: string;
          nextSyncAt: Date;
        };
        expect(health.status).toBe('ERROR');
        nextSyncDelays.push(
          Math.round((health.nextSyncAt.getTime() - Date.now()) / MINUTE_MS),
        );
        notifications.push(queueService.enqueueNotification.mock.calls.length);
      }

      expect(nextSyncDelays).toEqual([5, 10, 20]);
      expect(notifications).toEqual([0, 0, 1]);
    });

    it("honours a provider's Retry-After when it's longer than the backoff", async () => {
      const prisma = buildPrisma();
      const client = buildClient({
        listFolders: jest
          .fn()
          .mockRejectedValue(new MailRateLimitError('429', 60 * MINUTE_MS)),
      });
      const { service, emailAccountService } = buildService(prisma, client);

      await expect(
        service.syncAccount(accountId, 'incremental'),
      ).rejects.toThrow();

      const health = emailAccountService.markSyncFailed.mock.calls[0][2] as {
        nextSyncAt: Date;
      };
      expect(health.nextSyncAt.getTime() - Date.now()).toBeGreaterThan(
        59 * MINUTE_MS,
      );
    });

    it('fails the sync when every folder fails', async () => {
      const prisma = buildPrisma();
      const client = buildClient({
        listChanges: jest.fn().mockRejectedValue(new Error('folder gone')),
      });
      const { service, emailAccountService } = buildService(prisma, client);

      await expect(
        service.syncAccount(accountId, 'incremental'),
      ).rejects.toThrow('folder gone');
      expect(emailAccountService.markSyncCompleted).not.toHaveBeenCalled();
    });
  });

  describe('aliases and thread metadata', () => {
    it("treats mail sent from one of the account's aliases as the user's own, not inbound", async () => {
      const prisma = buildPrisma(buildAccount({ aliases: ['me@alias.com'] }));
      const client = buildClient({
        listChanges: jest.fn().mockResolvedValue({
          upserted: [{ providerMessageId: 'mine' }],
          removed: [],
          nextCursor: 'cursor-2',
        }),
        getMessage: jest.fn((id: string) =>
          Promise.resolve(message(id, { from: [{ address: 'Me@Alias.com' }] })),
        ),
      });
      const { service, queueService } = buildService(prisma, client);

      await service.syncAccount(accountId, 'incremental');

      expect(queueService.enqueueAiProcessing).not.toHaveBeenCalled();
    });

    it('refreshes stale aliases from the provider', async () => {
      const prisma = buildPrisma(buildAccount({ aliasesRefreshedAt: null }));
      const client = buildClient({
        listAliases: jest
          .fn()
          .mockResolvedValue(['user@example.com', 'sales@example.com']),
      });
      const { service } = buildService(prisma, client);

      await service.syncAccount(accountId, 'incremental');

      expect(prisma.emailAccount.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: {
          aliases: ['sales@example.com'],
          aliasesRefreshedAt: expect.any(Date) as Date,
        },
      });
    });

    it('only lets a NEWER message update the thread subject/snippet/lastMessageAt', async () => {
      const prisma = buildPrisma(buildAccount(), { syncCursor: null });
      const receivedAt = new Date('2026-10-01T10:00:00Z');
      const client = buildClient({
        listMessages: jest
          .fn()
          .mockResolvedValue({ messages: [message('m1', { receivedAt })] }),
      });
      const { service } = buildService(prisma, client);

      await service.syncAccount(accountId, 'incremental');

      expect(prisma.emailThread.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: {} }),
      );
      expect(prisma.emailThread.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'thread-row-1',
          OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: receivedAt } }],
        },
        data: {
          subject: 'Subject m1',
          snippet: undefined,
          lastMessageAt: receivedAt,
          lastMessageFromSelf: false,
        },
      });
    });
  });
});
