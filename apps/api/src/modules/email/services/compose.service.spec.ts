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
          aliases: [],
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
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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

    it('cancels a still-pending approval chain when its draft is deleted', async () => {
      const prisma = buildPrismaMock();
      prisma.emailMessage.findUnique.mockResolvedValue(buildDraftMock());

      const service = buildDeps(prisma);
      await service.deleteDraft('user-1', draftMessageId);

      expect(prisma.approvalChain.updateMany).toHaveBeenCalledWith({
        where: { draftMessageId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
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

  describe('drafts that answer a synced message (AI-held replies)', () => {
    const originalMessageId = 'original-1';

    function buildDeps(prisma: ReturnType<typeof buildPrismaMock>) {
      const sendMessage = jest
        .fn()
        .mockResolvedValue({ providerMessageId: 'sent-1', providerThreadId });

      const emailAccountService = {
        getOwnedAccountOrThrow: jest.fn(),
        getAccessibleAccountOrThrow: jest
          .fn()
          .mockResolvedValue({
            id: accountId,
            email: 'me@example.com',
            aliases: ['sales@example.com'],
          }),
      } as unknown as EmailAccountService;

      const mailProviderFactory = {
        createClient: jest.fn().mockResolvedValue({
          listFolders: jest.fn(),
          listMessages: jest.fn(),
          getMessage: jest.fn(),
          sendMessage,
          markAsRead: jest.fn(),
        } satisfies MailProviderClient),
      } as unknown as MailProviderFactory;

      const inboxService = {
        getMessageOwned: jest.fn().mockResolvedValue({
          id: originalMessageId,
          providerMessageId: 'provider-original-1',
          subject: 'hello',
          from: [{ address: 'them@example.com' }],
          to: [{ address: 'sales@example.com' }],
          cc: [{ address: 'colleague@example.com' }],
          messageIdHeader: '<original@mail.example.com>',
          references: ['<root@mail.example.com>'],
          thread: {
            providerThreadId,
            account: { id: accountId, provider: 'GOOGLE', userId: 'user-1' },
          },
        }),
      } as unknown as InboxService;

      const service = new ComposeService(
        prisma as unknown as PrismaService,
        emailAccountService,
        mailProviderFactory,
        inboxService,
      );

      return { service, sendMessage };
    }

    const aiMetadata = {
      ragUsed: false,
      contactMemoryUsed: false,
      crmContactUsed: false,
      calendarAgentUsed: false,
      provider: 'test',
      model: 'test-model',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      documents: [],
      draftText: 'hi',
    };

    function withoutDraftText(metadata: typeof aiMetadata) {
      const copy: Partial<typeof aiMetadata> = { ...metadata };
      delete copy.draftText;
      return copy as Omit<typeof aiMetadata, 'draftText'>;
    }

    it('sends the draft as a reply in the original conversation, not as a new email', async () => {
      const prisma = buildPrismaMock();
      prisma.emailMessage.findUnique.mockResolvedValue({
        ...buildDraftMock(),
        inReplyToMessageId: originalMessageId,
        generationMetadata: aiMetadata,
      });
      const { service, sendMessage } = buildDeps(prisma);

      await service.sendDraft('user-1', draftMessageId);

      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          to: [{ address: 'them@example.com' }],
          subject: 'Re: hello',
          inReplyToProviderMessageId: 'provider-original-1',
          providerThreadId,
        }),
      );
    });

    it('carries AI provenance to the sent copy and records that the text was not edited', async () => {
      const prisma = buildPrismaMock();
      prisma.emailMessage.findUnique.mockResolvedValue({
        ...buildDraftMock(),
        inReplyToMessageId: originalMessageId,
        generationMetadata: aiMetadata,
      });
      const { service } = buildDeps(prisma);

      await service.sendDraft('user-1', draftMessageId);

      const expectedMetadata = withoutDraftText(aiMetadata);
      expect(prisma.emailMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          generationMetadata: expectedMetadata,
          aiEdited: false,
        }) as unknown,
      });
    });

    it('records aiEdited when the reviewer changed the AI text', async () => {
      const prisma = buildPrismaMock();
      prisma.emailMessage.findUnique.mockResolvedValue({
        ...buildDraftMock(),
        bodyText: 'hi — and one more thing',
        inReplyToMessageId: originalMessageId,
        generationMetadata: aiMetadata,
      });
      const { service } = buildDeps(prisma);

      await service.sendDraft('user-1', draftMessageId);

      expect(prisma.emailMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ aiEdited: true }) as unknown,
      });
    });

    it('saveDraftReply escapes the AI text and remembers it for the edit check', async () => {
      const prisma = {
        ...buildPrismaMock(),
        emailThread: {
          create: jest.fn().mockResolvedValue({ id: 'draft-thread-1' }),
        },
      };
      const { service } = buildDeps(
        prisma as unknown as ReturnType<typeof buildPrismaMock>,
      );
      const metadata = withoutDraftText(aiMetadata);

      await service.saveDraftReply(
        'user-1',
        originalMessageId,
        { subject: 'Re: hello', bodyText: 'See <a href="x">this</a>' },
        metadata,
      );

      expect(prisma.emailMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          bodyHtml: '<p>See &lt;a href=&quot;x&quot;&gt;this&lt;/a&gt;</p>',
          inReplyToMessageId: originalMessageId,
          generationMetadata: {
            ...metadata,
            draftText: 'See <a href="x">this</a>',
          },
        }) as unknown,
      });
    });

    it('reply() threads with the RFC Message-ID and reply-all copies everyone but the user', async () => {
      const prisma = buildPrismaMock();
      const { service, sendMessage } = buildDeps(prisma);

      await service.reply('user-1', {
        messageId: originalMessageId,
        bodyHtml: '<p>hi</p>',
        replyAll: true,
      });

      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          to: [{ address: 'them@example.com' }],
          cc: [{ address: 'colleague@example.com' }],
          inReplyToProviderMessageId: 'provider-original-1',
          inReplyToHeader: '<original@mail.example.com>',
          referencesHeader: [
            '<root@mail.example.com>',
            '<original@mail.example.com>',
          ],
        }),
      );
    });
  });
});
