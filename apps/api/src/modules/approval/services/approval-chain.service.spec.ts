import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { EmailAccountService } from '../../email-account/services/email-account.service';
import type { ComposeService } from '../../email/services/compose.service';
import type { NotificationService } from '../../notification/services/notification.service';
import { ApprovalChainService } from './approval-chain.service';

/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment -- jest.fn() mocks / expect.any() matchers */

describe('ApprovalChainService', () => {
  const accountId = 'account-1';
  const draftMessageId = 'draft-1';
  const chainId = 'chain-1';
  const HOUR_MS = 60 * 60 * 1000;

  function step(order: number, approverUserId: string, status: string) {
    return {
      id: `step-${order}`,
      chainId,
      order,
      approverUserId,
      status,
      comment: null,
      decidedAt: null,
    };
  }

  function chain(
    status: string,
    steps: ReturnType<typeof step>[],
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id: chainId,
      accountId,
      draftMessageId,
      status,
      steps,
      draftSubject: 'Re: hello',
      createdAt: new Date(Date.now() - 10 * HOUR_MS),
      expiresAt: new Date(Date.now() + 62 * HOUR_MS),
      reminderSentAt: null,
      draftMessage: {
        id: draftMessageId,
        subject: 'Re: hello',
        bodyText: 'hi',
        to: [],
        threadId: 'thread-1',
      },
      account: { id: accountId, email: 'acct@example.com', userId: 'owner-1' },
      ...overrides,
    };
  }

  function buildDeps() {
    const tx = {
      approvalStep: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      approvalChain: {
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn(),
      },
    };

    const prisma = {
      tx,
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
      approvalChain: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({}),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      emailMessage: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          subject: 'Re: hello',
          to: [{ address: 'customer@example.com' }],
        }),
      },
      accountMember: {
        findMany: jest.fn(
          ({ where }: { where: { userId: { in: string[] } } }) =>
            Promise.resolve(
              where.userId.in
                .filter((id) => id !== 'outsider')
                .map((userId) => ({ userId })),
            ),
        ),
      },
    };

    const emailAccountService = {
      getAccessibleAccountOrThrow: jest
        .fn()
        .mockResolvedValue({ id: accountId }),
    } as unknown as jest.Mocked<EmailAccountService>;

    const notificationService = {
      create: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<NotificationService>;

    const composeService = {
      sendDraft: jest.fn().mockResolvedValue({ providerMessageId: 'sent-1' }),
    } as unknown as jest.Mocked<ComposeService>;

    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    const service = new ApprovalChainService(
      prisma as never,
      emailAccountService,
      notificationService,
      composeService,
      configService,
    );

    return { service, prisma, notificationService, composeService };
  }

  describe('create', () => {
    it('starts the first step PENDING and the rest WAITING, snapshots the draft, sets an expiry, and notifies only the first approver', async () => {
      const { service, prisma, notificationService } = buildDeps();
      prisma.approvalChain.create.mockResolvedValue(
        chain('PENDING', [step(0, 'u1', 'PENDING'), step(1, 'u2', 'WAITING')]),
      );

      await service.create(accountId, draftMessageId, ['u1', 'u2']);

      const { data } = prisma.approvalChain.create.mock.calls[0][0] as {
        data: Record<string, unknown> & { expiresAt: Date };
      };
      expect(data).toMatchObject({
        accountId,
        draftMessageId,
        draftSubject: 'Re: hello',
        draftRecipients: [{ address: 'customer@example.com' }],
        steps: {
          create: [
            { order: 0, approverUserId: 'u1', status: 'PENDING' },
            { order: 1, approverUserId: 'u2', status: 'WAITING' },
          ],
        },
      });
      expect(
        Math.round((data.expiresAt.getTime() - Date.now()) / HOUR_MS),
      ).toBe(72);
      expect(notificationService.create).toHaveBeenCalledTimes(1);
      expect(notificationService.create).toHaveBeenCalledWith(
        'u1',
        expect.any(String),
        expect.any(String),
        expect.anything(),
      );
    });

    it('honours a per-rule expiry', async () => {
      const { service, prisma } = buildDeps();
      prisma.approvalChain.create.mockResolvedValue(
        chain('PENDING', [step(0, 'u1', 'PENDING')]),
      );

      await service.create(accountId, draftMessageId, ['u1'], {
        expiresInHours: 8,
      });

      const { data } = prisma.approvalChain.create.mock.calls[0][0] as {
        data: { expiresAt: Date };
      };
      expect(
        Math.round((data.expiresAt.getTime() - Date.now()) / HOUR_MS),
      ).toBe(8);
    });

    it('refuses approvers who are not members of the account', async () => {
      const { service, prisma } = buildDeps();

      await expect(
        service.create(accountId, draftMessageId, ['u1', 'outsider']),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.approvalChain.create).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('advances a non-final step to the next approver without sending', async () => {
      const { service, prisma, notificationService, composeService } =
        buildDeps();
      prisma.approvalChain.findUnique.mockResolvedValue(
        chain('PENDING', [step(0, 'u1', 'PENDING'), step(1, 'u2', 'WAITING')]),
      );

      await service.approve('u1', chainId);

      expect(prisma.tx.approvalStep.updateMany).toHaveBeenCalledWith({
        where: { id: 'step-0', status: 'PENDING' },
        data: {
          status: 'APPROVED',
          comment: undefined,
          decidedAt: expect.any(Date),
        },
      });
      expect(prisma.tx.approvalStep.update).toHaveBeenCalledWith({
        where: { id: 'step-1' },
        data: { status: 'PENDING' },
      });
      expect(prisma.tx.approvalChain.update).not.toHaveBeenCalled();
      expect(composeService.sendDraft).not.toHaveBeenCalled();
      expect(notificationService.create).toHaveBeenCalledWith(
        'u2',
        expect.any(String),
        expect.any(String),
        expect.anything(),
      );
    });

    it('sends the draft once the final step approves, and records what it was sent as', async () => {
      const { service, prisma, composeService } = buildDeps();
      prisma.approvalChain.findUnique.mockResolvedValue(
        chain('PENDING', [step(0, 'u1', 'PENDING')]),
      );

      await service.approve('u1', chainId);

      expect(prisma.tx.approvalChain.update).toHaveBeenCalledWith({
        where: { id: chainId },
        data: { status: 'APPROVED' },
      });
      expect(composeService.sendDraft).toHaveBeenCalledWith(
        'owner-1',
        draftMessageId,
      );
      expect(prisma.approvalChain.update).toHaveBeenCalledWith({
        where: { id: chainId },
        data: { sentMessageId: 'sent-1' },
      });
    });

    it('turns a concurrent decision into a conflict instead of applying both', async () => {
      const { service, prisma, composeService } = buildDeps();
      prisma.approvalChain.findUnique.mockResolvedValue(
        chain('PENDING', [step(0, 'u1', 'PENDING')]),
      );
      // Another request already decided this step.
      prisma.tx.approvalStep.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve('u1', chainId)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(composeService.sendDraft).not.toHaveBeenCalled();
    });

    it('rejects a decision from someone other than the current step approver', async () => {
      const { service, prisma } = buildDeps();
      prisma.approvalChain.findUnique.mockResolvedValue(
        chain('PENDING', [step(0, 'u1', 'PENDING'), step(1, 'u2', 'WAITING')]),
      );

      await expect(
        service.approve('someone-else', chainId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects acting on an already-resolved chain', async () => {
      const { service, prisma } = buildDeps();
      prisma.approvalChain.findUnique.mockResolvedValue(
        chain('APPROVED', [step(0, 'u1', 'APPROVED')]),
      );

      await expect(service.approve('u1', chainId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects acting on a chain whose draft no longer exists', async () => {
      const { service, prisma } = buildDeps();
      prisma.approvalChain.findUnique.mockResolvedValue(
        chain('PENDING', [step(0, 'u1', 'PENDING')], {
          draftMessageId: null,
          draftMessage: null,
        }),
      );

      await expect(service.approve('u1', chainId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('reject', () => {
    it('marks the chain REJECTED and notifies the account owner, without advancing or sending', async () => {
      const { service, prisma, notificationService, composeService } =
        buildDeps();
      prisma.approvalChain.findUnique.mockResolvedValue(
        chain('PENDING', [step(0, 'u1', 'PENDING'), step(1, 'u2', 'WAITING')]),
      );

      await service.reject('u1', chainId, 'Too informal');

      expect(prisma.tx.approvalChain.update).toHaveBeenCalledWith({
        where: { id: chainId },
        data: { status: 'REJECTED' },
      });
      expect(prisma.tx.approvalStep.update).not.toHaveBeenCalled();
      expect(composeService.sendDraft).not.toHaveBeenCalled();
      expect(notificationService.create).toHaveBeenCalledWith(
        'owner-1',
        'An approval chain was rejected',
        expect.stringContaining('Too informal'),
        expect.anything(),
      );
    });
  });

  describe('listPendingForUser', () => {
    it('queries chains where the user has a currently-pending step and the draft still exists', async () => {
      const { service, prisma } = buildDeps();
      prisma.approvalChain.findMany.mockResolvedValue([]);

      await service.listPendingForUser('u1');

      expect(prisma.approvalChain.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'PENDING',
            draftMessageId: { not: null },
            steps: { some: { approverUserId: 'u1', status: 'PENDING' } },
          },
        }),
      );
    });
  });

  describe('sweep', () => {
    it('reminds the current approver once the chain is past halfway', async () => {
      const { service, prisma, notificationService } = buildDeps();
      prisma.approvalChain.findMany.mockResolvedValue([
        chain(
          'PENDING',
          [step(0, 'u1', 'APPROVED'), step(1, 'u2', 'PENDING')],
          {
            createdAt: new Date(Date.now() - 50 * HOUR_MS),
            expiresAt: new Date(Date.now() + 22 * HOUR_MS),
          },
        ),
      ]);

      const result = await service.sweep();

      expect(result).toEqual({ reminded: 1, expired: 0 });
      expect(notificationService.create).toHaveBeenCalledWith(
        'u2',
        'Reminder: your approval is needed',
        expect.any(String),
        expect.anything(),
      );
    });

    it('does not remind before halfway', async () => {
      const { service, prisma, notificationService } = buildDeps();
      prisma.approvalChain.findMany.mockResolvedValue([
        chain('PENDING', [step(0, 'u1', 'PENDING')]),
      ]);

      const result = await service.sweep();

      expect(result).toEqual({ reminded: 0, expired: 0 });
      expect(notificationService.create).not.toHaveBeenCalled();
    });

    it('expires chains past their deadline and tells the owner', async () => {
      const { service, prisma, notificationService } = buildDeps();
      prisma.approvalChain.findMany.mockResolvedValue([
        chain('PENDING', [step(0, 'u1', 'PENDING')], {
          expiresAt: new Date(Date.now() - HOUR_MS),
        }),
      ]);

      const result = await service.sweep();

      expect(result).toEqual({ reminded: 0, expired: 1 });
      expect(prisma.approvalChain.updateMany).toHaveBeenCalledWith({
        where: { id: chainId, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      expect(notificationService.create).toHaveBeenCalledWith(
        'owner-1',
        'An approval chain expired',
        expect.any(String),
        expect.anything(),
      );
    });
  });
});
