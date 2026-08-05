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
          filterMarketing: true,
          filterOtp: true,
          filterPasswordReset: true,
          filterBilling: true,
          filterShipping: true,
          filterCalendar: true,
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
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'message-row-1' }),
      },
    };
  }

  function buildClient(from: { address: string }[]): MailProviderClient {
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
            from,
            to: [{ address: 'b@example.com' }],
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
            },
          },
        ],
      }),
      getMessage: jest.fn(),
      sendMessage: jest.fn(),
      markAsRead: jest.fn(),
    };
  }

  function buildService(
    prisma: ReturnType<typeof buildPrismaMock>,
    client: MailProviderClient,
    queueService: {
      enqueueNotification: jest.Mock;
      enqueueAiProcessing: jest.Mock;
    },
  ): EmailSyncService {
    const emailAccountService = {
      markSyncStarted: jest.fn(),
      markSyncCompleted: jest.fn(),
      markSyncFailed: jest.fn(),
    } as unknown as EmailAccountService;

    const mailProviderFactory = {
      createClient: jest.fn().mockResolvedValue(client),
    } as unknown as MailProviderFactory;

    return new EmailSyncService(
      prisma as unknown as PrismaService,
      emailAccountService,
      mailProviderFactory,
      queueService as unknown as QueueService,
    );
  }

  it('upserts EmailThread scoped by { accountId, providerThreadId }, not folderId', async () => {
    const prisma = buildPrismaMock();
    const client = buildClient([{ address: 'a@example.com' }]);
    const queueService = {
      enqueueNotification: jest.fn(),
      enqueueAiProcessing: jest.fn(),
    };

    const service = buildService(prisma, client, queueService);

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

  it('enqueues AI processing for a new inbound message', async () => {
    const prisma = buildPrismaMock();
    const client = buildClient([{ address: 'a@example.com' }]);
    const queueService = {
      enqueueNotification: jest.fn(),
      enqueueAiProcessing: jest.fn(),
    };

    const service = buildService(prisma, client, queueService);

    await service.syncAccount(accountId, 'full');

    expect(queueService.enqueueAiProcessing).toHaveBeenCalledWith(
      'message-row-1',
    );
  });

  it('does not enqueue AI processing for our own outbound (SENT-copy) message', async () => {
    const prisma = buildPrismaMock();
    // The account owner (user@example.com) is the sender — this is our own
    // outbound mail, not something to auto-reply to.
    const client = buildClient([{ address: 'user@example.com' }]);
    const queueService = {
      enqueueNotification: jest.fn(),
      enqueueAiProcessing: jest.fn(),
    };

    const service = buildService(prisma, client, queueService);

    await service.syncAccount(accountId, 'full');

    expect(queueService.enqueueAiProcessing).not.toHaveBeenCalled();
  });

  it('does not enqueue AI processing when the message already existed (resync, not new)', async () => {
    const prisma = buildPrismaMock();
    prisma.emailMessage.findUnique.mockResolvedValue({ id: 'message-row-1' });
    const client = buildClient([{ address: 'a@example.com' }]);
    const queueService = {
      enqueueNotification: jest.fn(),
      enqueueAiProcessing: jest.fn(),
    };

    const service = buildService(prisma, client, queueService);

    await service.syncAccount(accountId, 'full');

    expect(queueService.enqueueAiProcessing).not.toHaveBeenCalled();
  });
});
