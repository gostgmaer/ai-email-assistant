import { ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../../../database';
import { EmailAccountService } from '../../email-account';
import { MailProviderClient } from '../interfaces';
import { MailProviderFactory } from '../providers/mail-provider.factory';
import { ComposeService } from './compose.service';
import { InboxService } from './inbox.service';

describe('ComposeService', () => {
  const accountId = 'account-1';
  const providerThreadId = 'thread-xyz';
  const draftMessageId = 'draft-1';

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
        delete: jest.fn(),
      },
      emailMessage: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
      },
      approvalChain: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
  }

  function buildDraftMock() {
    return {
      id: draftMessageId,
      threadId: 'draft-thread-1',
      subject: 'Re: hello',
      bodyHtml: '<p>hi</p>',
      bodyText: 'hi',
      to: [{ address: 'them@example.com' }],
      cc: null,
      bcc: null,
      thread: {
        folder: {
          type: 'DRAFTS',
          account: { id: accountId, email: 'me@example.com' },
        },
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

  describe('sendDraft — approval chain gate', () => {
    function buildDeps(prisma: ReturnType<typeof buildPrismaMock>) {
      const emailAccountService = {
        getOwnedAccountOrThrow: jest.fn(),
        getAccessibleAccountOrThrow: jest
          .fn()
          .mockResolvedValue({ id: accountId, email: 'me@example.com' }),
      } as unknown as EmailAccountService;

      const mailProviderFactory = {
        createClient: jest.fn().mockResolvedValue({
          listFolders: jest.fn(),
          listMessages: jest.fn(),
          getMessage: jest.fn(),
          sendMessage: jest
            .fn()
            .mockResolvedValue({ providerMessageId: 'sent-1', providerThreadId }),
          markAsRead: jest.fn(),
        } satisfies MailProviderClient),
      } as unknown as MailProviderFactory;

      const inboxService = {} as unknown as InboxService;

      return new ComposeService(
        prisma as unknown as PrismaService,
        emailAccountService,
        mailProviderFactory,
        inboxService,
      );
    }

    it('blocks sending while an approval chain is PENDING', async () => {
      const prisma = buildPrismaMock();
      prisma.emailMessage.findUnique.mockResolvedValue(buildDraftMock());
      prisma.approvalChain.findUnique.mockResolvedValue({ status: 'PENDING' });

      const service = buildDeps(prisma);

      await expect(
        service.sendDraft('user-1', draftMessageId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.emailThread.delete).not.toHaveBeenCalled();
    });

    it('allows sending once the chain is REJECTED — rejection returns manual control, it does not lock the draft forever', async () => {
      const prisma = buildPrismaMock();
      prisma.emailMessage.findUnique.mockResolvedValue(buildDraftMock());
      prisma.approvalChain.findUnique.mockResolvedValue({ status: 'REJECTED' });

      const service = buildDeps(prisma);

      await expect(
        service.sendDraft('user-1', draftMessageId),
      ).resolves.toBeDefined();
      expect(prisma.emailThread.delete).toHaveBeenCalled();
    });

    it('allows sending when no approval chain exists for the draft', async () => {
      const prisma = buildPrismaMock();
      prisma.emailMessage.findUnique.mockResolvedValue(buildDraftMock());
      prisma.approvalChain.findUnique.mockResolvedValue(null);

      const service = buildDeps(prisma);

      await expect(
        service.sendDraft('user-1', draftMessageId),
      ).resolves.toBeDefined();
    });
  });
});
