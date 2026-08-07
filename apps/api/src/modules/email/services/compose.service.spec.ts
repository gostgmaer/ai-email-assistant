import { PrismaService } from '../../../database';
import { EmailAccountService } from '../../email-account';
import { MailProviderClient } from '../interfaces';
import { MailProviderFactory } from '../providers/mail-provider.factory';
import { ComposeService } from './compose.service';
import { InboxService } from './inbox.service';

describe('ComposeService', () => {
  const accountId = 'account-1';
  const providerThreadId = 'thread-xyz';

  function buildPrismaMock() {
    return {
      emailAccount: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: accountId,
          email: 'me@example.com',
        }),
      },
      mailFolder: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValue({ id: 'sent-folder-1', accountId, type: 'SENT' }),
      },
      emailThread: {
        upsert: jest.fn().mockResolvedValue({ id: 'thread-row-1' }),
      },
      emailMessage: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
  }

  it('upserts EmailThread scoped by { accountId, providerThreadId }, not folderId', async () => {
    const prisma = buildPrismaMock();

    const client: MailProviderClient = {
      listFolders: jest.fn(),
      listMessages: jest.fn(),
      getMessage: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue({
        providerMessageId: 'sent-msg-1',
        providerThreadId,
      }),
      markAsRead: jest.fn(),
    };

    const emailAccountService = {
      getOwnedAccountOrThrow: jest
        .fn()
        .mockResolvedValue({ id: accountId, email: 'me@example.com' }),
      getAccessibleAccountOrThrow: jest
        .fn()
        .mockResolvedValue({ id: accountId, email: 'me@example.com' }),
    } as unknown as EmailAccountService;

    const mailProviderFactory = {
      createClient: jest.fn().mockResolvedValue(client),
    } as unknown as MailProviderFactory;

    const inboxService = {} as unknown as InboxService;

    const service = new ComposeService(
      prisma as unknown as PrismaService,
      emailAccountService,
      mailProviderFactory,
      inboxService,
    );

    await service.send('user-1', {
      accountId,
      to: [{ address: 'them@example.com' }],
      subject: 'Hello',
      bodyHtml: '<p>Hi</p>',
    });

    /* eslint-disable @typescript-eslint/no-unsafe-assignment -- jest.fn() mock, not worth typing Prisma's upsert generics here */
    expect(prisma.emailThread.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountId_providerThreadId: { accountId, providerThreadId },
        },
        create: expect.objectContaining({ accountId }),
      }),
    );
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  });
});
