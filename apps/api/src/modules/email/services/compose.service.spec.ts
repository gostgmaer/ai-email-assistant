import { ConflictException, ForbiddenException } from '@nestjs/common';

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
      aiDraftOutcome: { create: jest.fn().mockResolvedValue({}) },
    };
  }

  function buildDraftMock() {
    return {
      id: draftMessageId,
      threadId: 'draft-thread-1',
      createdAt: new Date(Date.now() - 60_000),
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
      getAttachment: jest.fn(),
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
          getAttachment: jest.fn(),
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
          getAttachment: jest.fn(),
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
      // The quality metrics get the outcome, how much changed, and when.
      const [[outcome]] = prisma.aiDraftOutcome.create.mock.calls as [
        [{ data: { outcome: string; edited: boolean; editDistance: number } }],
      ];
      expect(outcome.data).toMatchObject({ outcome: 'SENT', edited: true });
      expect(outcome.data.editDistance).toBeGreaterThan(0);
    });

    it('records a discarded AI draft, but not one the pipeline replaced itself', async () => {
      const prisma = buildPrismaMock();
      prisma.emailMessage.findUnique.mockResolvedValue({
        ...buildDraftMock(),
        scheduledSendAt: null,
        generationMetadata: aiMetadata,
      });
      const { service } = buildDeps(prisma);

      await service.deleteDraft('user-1', draftMessageId, {
        recordOutcome: false,
      });
      expect(prisma.aiDraftOutcome.create).not.toHaveBeenCalled();

      await service.deleteDraft('user-1', draftMessageId);
      expect(prisma.aiDraftOutcome.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ outcome: 'DISCARDED' }) as unknown,
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

  describe('scheduled auto-replies', () => {
    const scheduledAt = new Date('2026-10-20T12:00:30Z');

    function buildDeps(effectStatus: string | null = 'SCHEDULED') {
      const base = buildPrismaMock();
      const prisma = {
        ...base,
        emailMessage: {
          ...base.emailMessage,
          update: jest.fn().mockResolvedValue({}),
          findUniqueOrThrow: jest
            .fn()
            .mockResolvedValue({ id: draftMessageId }),
        },
        automationEffect: {
          updateMany: jest
            .fn()
            .mockResolvedValue({ count: effectStatus === 'SCHEDULED' ? 1 : 0 }),
          findUnique: jest
            .fn()
            .mockResolvedValue(effectStatus ? { status: effectStatus } : null),
        },
      };
      prisma.emailMessage.findUnique.mockResolvedValue({
        ...buildDraftMock(),
        scheduledSendAt: scheduledAt,
        inReplyToMessageId: null,
      });

      const sendMessage = jest
        .fn()
        .mockResolvedValue({ providerMessageId: 'sent-1', providerThreadId });
      const service = new ComposeService(
        prisma as unknown as PrismaService,
        {
          getAccessibleAccountOrThrow: jest
            .fn()
            .mockResolvedValue({ id: accountId, email: 'me@example.com' }),
        } as unknown as EmailAccountService,
        {
          createClient: jest.fn().mockResolvedValue({ sendMessage }),
        } as unknown as MailProviderFactory,
        {} as unknown as InboxService,
      );

      return { service, prisma, sendMessage };
    }

    function withOriginal(prisma: ReturnType<typeof buildDeps>['prisma']) {
      prisma.emailMessage.findUnique.mockResolvedValue({
        ...buildDraftMock(),
        scheduledSendAt: scheduledAt,
        inReplyToMessageId: 'original-1',
      });
    }

    it('cancelling moves the send SCHEDULED -> CANCELLED and keeps the draft', async () => {
      const { service, prisma } = buildDeps();
      withOriginal(prisma);

      await service.cancelScheduledSend('user-1', draftMessageId);

      expect(prisma.automationEffect.updateMany).toHaveBeenCalledWith({
        where: { messageId: 'original-1', kind: 'SEND', status: 'SCHEDULED' },
        data: { status: 'CANCELLED' },
      });
      expect(prisma.emailMessage.update).toHaveBeenCalledWith({
        where: { id: draftMessageId },
        data: { scheduledSendAt: null },
      });
      expect(prisma.emailThread.delete).not.toHaveBeenCalled();
    });

    it('refuses to cancel a reply that is already being sent', async () => {
      const { service, prisma } = buildDeps('PENDING');
      withOriginal(prisma);

      await expect(
        service.cancelScheduledSend('user-1', draftMessageId),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.emailMessage.update).not.toHaveBeenCalled();
    });

    it('refuses to cancel a draft that is not scheduled', async () => {
      const { service, prisma } = buildDeps();
      prisma.emailMessage.findUnique.mockResolvedValue(buildDraftMock());

      await expect(
        service.cancelScheduledSend('user-1', draftMessageId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('a person sending a scheduled draft early cancels the schedule first, so it goes out once', async () => {
      const { service, prisma, sendMessage } = buildDeps();
      withOriginal(prisma);
      Object.assign(service, {
        sendDraftAsReply: jest.fn().mockResolvedValue({ id: 'sent' }),
      });

      await service.sendDraft('user-1', draftMessageId);

      expect(prisma.automationEffect.updateMany).toHaveBeenCalledTimes(1);
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('the scheduler sends without touching the schedule, with the given headers', async () => {
      const { service, prisma, sendMessage } = buildDeps();

      await service.sendDraft('user-1', draftMessageId, {
        fromSchedule: true,
        headers: { 'Auto-Submitted': 'auto-replied' },
      });

      expect(prisma.automationEffect.updateMany).not.toHaveBeenCalled();
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { 'Auto-Submitted': 'auto-replied' },
        }),
      );
    });
  });

  describe('attachments and follow-up reminders on send', () => {
    function buildSendDeps() {
      const prisma = buildPrismaMock();
      const sendMessage = jest
        .fn()
        .mockResolvedValue({ providerMessageId: 'sent-1', providerThreadId });
      const service = new ComposeService(
        prisma as unknown as PrismaService,
        {
          getAccessibleAccountOrThrow: jest
            .fn()
            .mockResolvedValue({ id: accountId, email: 'me@example.com' }),
        } as unknown as EmailAccountService,
        {
          createClient: jest.fn().mockResolvedValue({ sendMessage }),
        } as unknown as MailProviderFactory,
        {} as unknown as InboxService,
      );
      return { service, prisma, sendMessage };
    }

    it('sends decoded attachments and sets the thread to remind after N days', async () => {
      const { service, prisma, sendMessage } = buildSendDeps();
      const before = Date.now();

      await service.send('user-1', {
        accountId,
        to: [{ address: 'them@example.com' }],
        subject: 'Proposal',
        bodyHtml: '<p>Attached.</p>',
        attachments: [
          {
            filename: 'proposal.pdf',
            contentType: 'application/pdf',
            contentBase64: Buffer.from('%PDF').toString('base64'),
          },
        ],
        remindIfNoReplyDays: 3,
      });

      const [input] = sendMessage.mock.calls[0] as [
        { attachments: { filename: string; content: Buffer }[] },
      ];
      expect(input.attachments[0].filename).toBe('proposal.pdf');
      expect(input.attachments[0].content.toString()).toBe('%PDF');

      const [[upsert]] = prisma.emailThread.upsert.mock.calls as [
        [{ create: { followUpAt: Date } }],
      ];
      expect(upsert.create.followUpAt.getTime()).toBeGreaterThanOrEqual(
        before + 3 * 24 * 60 * 60 * 1000,
      );
    });
  });
});
