import { PrismaService } from '../../../database';
import { EmailAccountService } from '../../email-account';
import { QueueService } from '../../../infrastructure/queue';
import { MailProviderClient } from '../interfaces';
import { MailProviderFactory } from '../providers/mail-provider.factory';
import { EmailSyncService } from './email-sync.service';

describe('EmailSyncService', () => {
  const accountId = 'account-1';
  const folderId = 'folder-1';
  const providerThreadId = 'thread-abc';

  function buildPrismaMock() {
    return {
      emailAccount: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: accountId,
          userId: 'user-1',
          email: 'user@example.com',
          syncEnabled: true,
          deletedAt: null,
        }),
      },
      mailFolder: {
        upsert: jest.fn().mockResolvedValue({
          id: folderId,
          accountId,
          providerFolderId: 'INBOX',
          type: 'INBOX',
          syncCursor: null,
        }),
        update: jest.fn(),
      },
      emailThread: {
        upsert: jest.fn().mockResolvedValue({ id: 'thread-row-1' }),
      },
      emailMessage: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
  }

  function buildClient(): MailProviderClient {
    return {
      listFolders: jest
        .fn()
        .mockResolvedValue([
          { providerFolderId: 'INBOX', name: 'Inbox', type: 'INBOX' },
        ]),
      listMessages: jest.fn().mockResolvedValue({
        messages: [
          {
            providerMessageId: 'msg-1',
            providerThreadId,
            from: [{ address: 'a@example.com' }],
            to: [{ address: 'b@example.com' }],
            receivedAt: new Date(),
            isRead: false,
          },
        ],
      }),
      getMessage: jest.fn(),
      sendMessage: jest.fn(),
      markAsRead: jest.fn(),
    };
  }

  it('upserts EmailThread scoped by { accountId, providerThreadId }, not folderId', async () => {
    const prisma = buildPrismaMock();
    const client = buildClient();

    const emailAccountService = {
      markSyncStarted: jest.fn(),
      markSyncCompleted: jest.fn(),
      markSyncFailed: jest.fn(),
    } as unknown as EmailAccountService;

    const mailProviderFactory = {
      createClient: jest.fn().mockResolvedValue(client),
    } as unknown as MailProviderFactory;

    const queueService = {
      enqueueNotification: jest.fn(),
    } as unknown as QueueService;

    const service = new EmailSyncService(
      prisma as unknown as PrismaService,
      emailAccountService,
      mailProviderFactory,
      queueService,
    );

    await service.syncAccount(accountId, 'full');

    /* eslint-disable @typescript-eslint/no-unsafe-assignment -- jest.fn() mock, not worth typing Prisma's upsert generics here */
    expect(prisma.emailThread.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountId_providerThreadId: { accountId, providerThreadId },
        },
        create: expect.objectContaining({ accountId, folderId }),
      }),
    );
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  });
});
