import { ConflictException, NotFoundException } from '@nestjs/common';

import type { EmailAccountService } from '../../email-account/services/email-account.service';
import { ContactService } from './contact.service';

describe('ContactService', () => {
  const userId = 'user-1';
  const accountId = 'account-1';

  function buildDeps() {
    const prisma = {
      contact: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    };

    const emailAccountService = {
      getAccessibleAccountOrThrow: jest
        .fn()
        .mockResolvedValue({ id: accountId }),
    } as unknown as jest.Mocked<EmailAccountService>;

    const service = new ContactService(prisma as never, emailAccountService);

    return { service, prisma, emailAccountService };
  }

  describe('create', () => {
    it('is member-accessible, not owner-only', async () => {
      const { service, prisma, emailAccountService } = buildDeps();
      prisma.contact.findUnique.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({ id: 'contact-1' });

      await service.create(userId, accountId, { email: 'a@b.com' });

      /* eslint-disable-next-line @typescript-eslint/unbound-method -- jest.fn() mock, never called unbound */
      expect(
        emailAccountService.getAccessibleAccountOrThrow,
      ).toHaveBeenCalledWith(userId, accountId);
    });

    it('defaults tags to an empty array when omitted', async () => {
      const { service, prisma } = buildDeps();
      prisma.contact.findUnique.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({ id: 'contact-1' });

      await service.create(userId, accountId, { email: 'a@b.com' });

      expect(prisma.contact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tags: [] }),
      });
    });

    it('throws ConflictException when a contact with this email already exists on the account', async () => {
      const { service, prisma } = buildDeps();
      prisma.contact.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create(userId, accountId, { email: 'a@b.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.contact.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws NotFoundException when updating a contact that does not belong to the account', async () => {
      const { service, prisma } = buildDeps();
      prisma.contact.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update(userId, accountId, 'contact-x', { name: 'New name' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('delete', () => {
    it('scopes delete by { id, accountId } so it never affects another account', async () => {
      const { service, prisma } = buildDeps();

      await service.delete(userId, accountId, 'contact-1');

      expect(prisma.contact.deleteMany).toHaveBeenCalledWith({
        where: { id: 'contact-1', accountId },
      });
    });
  });

  describe('touchLastContacted', () => {
    it('updates lastContactedAt scoped by accountId + email, without an ownership check', async () => {
      const { service, prisma, emailAccountService } = buildDeps();
      prisma.contact.updateMany.mockResolvedValue({ count: 1 });

      await service.touchLastContacted(accountId, 'a@b.com');

      expect(prisma.contact.updateMany).toHaveBeenCalledWith({
        where: { accountId, email: 'a@b.com' },
        data: { lastContactedAt: expect.any(Date) },
      });
      /* eslint-disable-next-line @typescript-eslint/unbound-method -- jest.fn() mock, never called unbound */
      expect(
        emailAccountService.getAccessibleAccountOrThrow,
      ).not.toHaveBeenCalled();
    });

    it('never creates a contact — a sender with no existing match is a silent no-op', async () => {
      const { service, prisma } = buildDeps();
      prisma.contact.updateMany.mockResolvedValue({ count: 0 });

      await service.touchLastContacted(accountId, 'stranger@example.com');

      expect(prisma.contact.create).not.toHaveBeenCalled();
    });
  });
});
