import { createHash } from 'crypto';

import { UnauthorizedException } from '@nestjs/common';

import { VerificationTokenService } from './verification-token.service';
import { VerificationTokenType } from '../../../generated/prisma/enums';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('VerificationTokenService', () => {
  function buildDeps() {
    const prisma = {
      verificationToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const service = new VerificationTokenService(prisma as never);

    return { service, prisma };
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('issue', () => {
    it('stores only the hash of the token, keyed to the user and type, with a 24h TTL for email verification', async () => {
      const { service, prisma } = buildDeps();
      prisma.verificationToken.create.mockResolvedValue({ id: 'vt-1' });

      const token = await service.issue(
        'user-1',
        VerificationTokenType.EMAIL_VERIFICATION,
      );

      expect(typeof token).toBe('string');
      expect(prisma.verificationToken.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: VerificationTokenType.EMAIL_VERIFICATION,
          tokenHash: sha256(token),
          newEmail: undefined,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    });

    it('gives a password reset token a 1 hour lifetime', async () => {
      const { service, prisma } = buildDeps();
      prisma.verificationToken.create.mockResolvedValue({ id: 'vt-1' });

      await service.issue('user-1', VerificationTokenType.PASSWORD_RESET);

      expect(prisma.verificationToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          }),
        }),
      );
    });

    it('gives an email change token a 1 hour lifetime and carries the pending new email', async () => {
      const { service, prisma } = buildDeps();
      prisma.verificationToken.create.mockResolvedValue({ id: 'vt-1' });

      await service.issue('user-1', VerificationTokenType.EMAIL_CHANGE, {
        newEmail: 'new@example.com',
      });

      expect(prisma.verificationToken.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: VerificationTokenType.EMAIL_CHANGE,
          tokenHash: expect.any(String),
          newEmail: 'new@example.com',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
    });
  });

  describe('consume', () => {
    function buildRecord(overrides?: Record<string, unknown>) {
      return {
        id: 'vt-1',
        userId: 'user-1',
        type: VerificationTokenType.EMAIL_VERIFICATION,
        usedAt: null as Date | null,
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
      };
    }

    it('rejects an unknown token', async () => {
      const { service, prisma } = buildDeps();
      prisma.verificationToken.findUnique.mockResolvedValue(null);

      await expect(
        service.consume('unknown', VerificationTokenType.EMAIL_VERIFICATION),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token presented for the wrong purpose', async () => {
      const { service, prisma } = buildDeps();
      prisma.verificationToken.findUnique.mockResolvedValue(
        buildRecord({ type: VerificationTokenType.PASSWORD_RESET }),
      );

      await expect(
        service.consume('a-token', VerificationTokenType.EMAIL_VERIFICATION),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token that was already used (replay protection)', async () => {
      const { service, prisma } = buildDeps();
      prisma.verificationToken.findUnique.mockResolvedValue(
        buildRecord({ usedAt: new Date() }),
      );

      await expect(
        service.consume('a-token', VerificationTokenType.EMAIL_VERIFICATION),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an expired token', async () => {
      const { service, prisma } = buildDeps();
      prisma.verificationToken.findUnique.mockResolvedValue(
        buildRecord({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(
        service.consume('a-token', VerificationTokenType.EMAIL_VERIFICATION),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('looks the token up by its sha256 hash', async () => {
      const { service, prisma } = buildDeps();
      prisma.verificationToken.findUnique.mockResolvedValue(buildRecord());

      await service.consume(
        'the-raw-token',
        VerificationTokenType.EMAIL_VERIFICATION,
      );

      expect(prisma.verificationToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: sha256('the-raw-token') },
      });
    });

    it('marks a valid token used and returns the record', async () => {
      const { service, prisma } = buildDeps();
      const record = buildRecord();
      prisma.verificationToken.findUnique.mockResolvedValue(record);

      const result = await service.consume(
        'the-raw-token',
        VerificationTokenType.EMAIL_VERIFICATION,
      );

      expect(prisma.verificationToken.update).toHaveBeenCalledWith({
        where: { id: 'vt-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(result).toBe(record);
    });
  });
});
