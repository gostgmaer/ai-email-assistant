import { BadRequestException, ForbiddenException } from '@nestjs/common';

import type { EmailAccountService } from '../../email-account/services/email-account.service';
import type { ComposeService } from '../../email/services/compose.service';
import type { NotificationService } from '../../notification/services/notification.service';
import { ApprovalChainService } from './approval-chain.service';

describe('ApprovalChainService', () => {
  const accountId = 'account-1';
  const draftMessageId = 'draft-1';
  const chainId = 'chain-1';

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

  function chain(status: string, steps: ReturnType<typeof step>[]) {
    return {
      id: chainId,
      accountId,
      draftMessageId,
      status,
      steps,
      draftMessage: {
        id: draftMessageId,
        subject: 'Re: hello',
        bodyText: 'hi',
        to: [],
        threadId: 'thread-1',
      },
      account: { id: accountId, email: 'acct@example.com', userId: 'owner-1' },
    };
  }

  function buildDeps() {
    const prisma = {
      approvalChain: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      approvalStep: {
        update: jest.fn(),
      },
    };

    const emailAccountService = {
      getAccessibleAccountOrThrow: jest
        .fn()
        .mockResolvedValue({ id: accountId }),
      getOwnedAccountOrThrow: jest.fn().mockResolvedValue({ id: accountId }),
    } as unknown as jest.Mocked<EmailAccountService>;

    const notificationService = {
      create: jest.fn(),
    } as unknown as jest.Mocked<NotificationService>;

    const composeService = {
      sendDraft: jest.fn(),
    } as unknown as jest.Mocked<ComposeService>;

    const service = new ApprovalChainService(
      prisma as never,
      emailAccountService,
      notificationService,
      composeService,
    );

    return {
      service,
      prisma,
      emailAccountService,
      notificationService,
      composeService,
    };
  }

  describe('create', () => {
    it('starts the first step PENDING and the rest WAITING, notifying only the first approver', async () => {
      const { service, prisma, notificationService } = buildDeps();
      const created = chain('PENDING', [
        step(0, 'u1', 'PENDING'),
        step(1, 'u2', 'WAITING'),
      ]);
      prisma.approvalChain.create.mockResolvedValue(created);

      await service.create(accountId, draftMessageId, ['u1', 'u2']);

      expect(prisma.approvalChain.create).toHaveBeenCalledWith({
        data: {
          accountId,
          draftMessageId,
          steps: {
            create: [
              { order: 0, approverUserId: 'u1', status: 'PENDING' },
              { order: 1, approverUserId: 'u2', status: 'WAITING' },
            ],
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.anything() is typed `any`
        include: expect.anything(),
      });

      /* eslint-disable-next-line @typescript-eslint/unbound-method -- jest.fn() mock, never called unbound */
      expect(notificationService.create).toHaveBeenCalledTimes(1);
      /* eslint-disable-next-line @typescript-eslint/unbound-method -- jest.fn() mock, never called unbound */
      expect(notificationService.create).toHaveBeenCalledWith(
        'u1',
        expect.any(String),
        expect.any(String),
        expect.anything(),
      );
    });
  });

  describe('approve', () => {
    it('advances a non-final step to the next approver without sending', async () => {
      const { service, prisma, notificationService, composeService } =
        buildDeps();
      const twoStepChain = chain('PENDING', [
        step(0, 'u1', 'PENDING'),
        step(1, 'u2', 'WAITING'),
      ]);
      prisma.approvalChain.findUnique.mockResolvedValue(twoStepChain);
      prisma.approvalChain.findUniqueOrThrow.mockResolvedValue(
        chain('PENDING', [step(0, 'u1', 'APPROVED'), step(1, 'u2', 'PENDING')]),
      );

      await service.approve('u1', chainId);

      expect(prisma.approvalStep.update).toHaveBeenCalledWith({
        where: { id: 'step-0' },
        data: {
          status: 'APPROVED',
          comment: undefined,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() is typed `any`
          decidedAt: expect.any(Date),
        },
      });
      expect(prisma.approvalStep.update).toHaveBeenCalledWith({
        where: { id: 'step-1' },
        data: { status: 'PENDING' },
      });
      expect(prisma.approvalChain.update).not.toHaveBeenCalled();
      /* eslint-disable-next-line @typescript-eslint/unbound-method -- jest.fn() mock, never called unbound */
      expect(composeService.sendDraft).not.toHaveBeenCalled();
      /* eslint-disable-next-line @typescript-eslint/unbound-method -- jest.fn() mock, never called unbound */
      expect(notificationService.create).toHaveBeenCalledWith(
        'u2',
        expect.any(String),
        expect.any(String),
        expect.anything(),
      );
    });

    it('sends the draft once the final step approves', async () => {
      const { service, prisma, composeService } = buildDeps();
      const oneStepChain = chain('PENDING', [step(0, 'u1', 'PENDING')]);
      prisma.approvalChain.findUnique.mockResolvedValue(oneStepChain);
      prisma.approvalChain.findUniqueOrThrow.mockResolvedValue(
        chain('APPROVED', [step(0, 'u1', 'APPROVED')]),
      );

      await service.approve('u1', chainId);

      expect(prisma.approvalChain.update).toHaveBeenCalledWith({
        where: { id: chainId },
        data: { status: 'APPROVED' },
      });
      /* eslint-disable-next-line @typescript-eslint/unbound-method -- jest.fn() mock, never called unbound */
      expect(composeService.sendDraft).toHaveBeenCalledWith(
        'owner-1',
        draftMessageId,
      );
    });

    it('rejects a decision from someone other than the current step approver', async () => {
      const { service, prisma } = buildDeps();
      prisma.approvalChain.findUnique.mockResolvedValue(
        chain('PENDING', [step(0, 'u1', 'PENDING'), step(1, 'u2', 'WAITING')]),
      );

      await expect(
        service.approve('someone-else', chainId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.approvalStep.update).not.toHaveBeenCalled();
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
  });

  describe('reject', () => {
    it('marks the chain REJECTED and notifies the account owner, without advancing or sending', async () => {
      const { service, prisma, notificationService, composeService } =
        buildDeps();
      prisma.approvalChain.findUnique.mockResolvedValue(
        chain('PENDING', [step(0, 'u1', 'PENDING'), step(1, 'u2', 'WAITING')]),
      );
      prisma.approvalChain.findUniqueOrThrow.mockResolvedValue(
        chain('REJECTED', [
          step(0, 'u1', 'REJECTED'),
          step(1, 'u2', 'WAITING'),
        ]),
      );

      await service.reject('u1', chainId, 'needs more detail');

      expect(prisma.approvalStep.update).toHaveBeenCalledWith({
        where: { id: 'step-0' },
        data: {
          status: 'REJECTED',
          comment: 'needs more detail',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() is typed `any`
          decidedAt: expect.any(Date),
        },
      });
      expect(prisma.approvalChain.update).toHaveBeenCalledWith({
        where: { id: chainId },
        data: { status: 'REJECTED' },
      });
      /* eslint-disable-next-line @typescript-eslint/unbound-method -- jest.fn() mock, never called unbound */
      expect(composeService.sendDraft).not.toHaveBeenCalled();
      /* eslint-disable-next-line @typescript-eslint/unbound-method -- jest.fn() mock, never called unbound */
      expect(notificationService.create).toHaveBeenCalledWith(
        'owner-1',
        expect.any(String),
        expect.stringContaining('needs more detail'),
        expect.anything(),
      );
    });
  });

  describe('listPendingForUser', () => {
    it('queries chains where the user has a currently-pending step', async () => {
      const { service, prisma } = buildDeps();
      prisma.approvalChain.findMany.mockResolvedValue([]);

      await service.listPendingForUser('u1');

      expect(prisma.approvalChain.findMany).toHaveBeenCalledWith({
        where: {
          status: 'PENDING',
          steps: { some: { approverUserId: 'u1', status: 'PENDING' } },
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.anything() is typed `any`
        include: expect.anything(),
        orderBy: { createdAt: 'asc' },
      });
    });
  });
});
