import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { VerificationTokenType } from '../../../generated/prisma/enums';
import type { MailerService } from '../../../infrastructure/mailer';
import type { OAuthProfile } from '../../oauth/interfaces';
import type { RegisterDto } from '../dto';
import type { PasswordService } from './password.service';
import type { TokenService } from './token.service';
import type { VerificationTokenService } from './verification-token.service';

describe('AuthService', () => {
  function buildUser(overrides?: Record<string, unknown>) {
    return {
      id: 'user-1',
      email: 'user@example.com',
      displayName: 'Existing Name',
      avatar: 'https://example.com/avatar.png',
      passwordHash: 'hashed-password',
      emailVerifiedAt: null as Date | null,
      googleId: null as string | null,
      microsoftId: null as string | null,
      deletedAt: null as Date | null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  function buildDeps() {
    const prisma = {
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
    };

    const tokenService = {
      issueTokenPair: jest.fn(),
      rotateRefreshToken: jest.fn(),
      revokeRefreshToken: jest.fn(),
    } as unknown as TokenService;

    const passwordService = {
      hash: jest.fn(),
      compare: jest.fn(),
    } as unknown as PasswordService;

    const verificationTokenService = {
      issue: jest.fn(),
      consume: jest.fn(),
    } as unknown as VerificationTokenService;

    const mailerService = {
      sendVerificationEmail: jest.fn(),
      sendPasswordResetEmail: jest.fn(),
    } as unknown as MailerService;

    const configService = {
      getOrThrow: jest.fn().mockReturnValue('https://app.example.com'),
    } as unknown as ConfigService;

    const service = new AuthService(
      prisma as never,
      tokenService,
      passwordService,
      verificationTokenService,
      mailerService,
      configService,
    );

    return {
      service,
      prisma,
      tokenService,
      passwordService,
      verificationTokenService,
      mailerService,
      configService,
    };
  }

  const tokenPair = { accessToken: 'access.jwt', refreshToken: 'raw-refresh-token' };

  describe('register', () => {
    it('rejects when the email is already registered', async () => {
      const { service, prisma, passwordService, tokenService } = buildDeps();
      prisma.user.findUnique.mockResolvedValue(buildUser());

      const dto: RegisterDto = {
        email: 'user@example.com',
        password: 'password123',
      };

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(passwordService.hash).not.toHaveBeenCalled();
      expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
    });

    it('creates the user, hashes the password, issues tokens, and emails a verification link', async () => {
      const {
        service,
        prisma,
        passwordService,
        tokenService,
        verificationTokenService,
        mailerService,
        configService,
      } = buildDeps();
      prisma.user.findUnique.mockResolvedValue(null);
      (passwordService.hash as jest.Mock).mockResolvedValue('hashed-pw');
      const createdUser = buildUser({ passwordHash: 'hashed-pw' });
      prisma.user.create.mockResolvedValue(createdUser);
      (tokenService.issueTokenPair as jest.Mock).mockResolvedValue(tokenPair);
      (verificationTokenService.issue as jest.Mock).mockResolvedValue(
        'verify-token',
      );

      const dto: RegisterDto = {
        email: 'user@example.com',
        password: 'password123',
        displayName: 'New User',
      };

      const result = await service.register(dto, { ipAddress: '127.0.0.1' });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });
      expect(passwordService.hash).toHaveBeenCalledWith('password123');
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'user@example.com',
          displayName: 'New User',
          passwordHash: 'hashed-pw',
        },
      });
      expect(tokenService.issueTokenPair).toHaveBeenCalledWith(
        { sub: createdUser.id, email: createdUser.email },
        { ipAddress: '127.0.0.1' },
      );
      expect(verificationTokenService.issue).toHaveBeenCalledWith(
        createdUser.id,
        VerificationTokenType.EMAIL_VERIFICATION,
      );
      expect(mailerService.sendVerificationEmail).toHaveBeenCalledWith(
        createdUser.email,
        expect.stringContaining('/verify-email?token=verify-token'),
      );
      expect(configService.getOrThrow).toHaveBeenCalledWith('FRONTEND_URL');
      expect(result).toEqual({ user: createdUser, tokens: tokenPair });
    });
  });

  describe('loginWithPassword', () => {
    it('rejects when no user has that email', async () => {
      const { service, prisma } = buildDeps();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.loginWithPassword('nobody@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects OAuth-only users who never set a password', async () => {
      const { service, prisma } = buildDeps();
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ passwordHash: null }),
      );

      await expect(
        service.loginWithPassword('user@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects soft-deleted accounts', async () => {
      const { service, prisma } = buildDeps();
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ deletedAt: new Date() }),
      );

      await expect(
        service.loginWithPassword('user@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an incorrect password without revealing which check failed', async () => {
      const { service, prisma, passwordService } = buildDeps();
      prisma.user.findUnique.mockResolvedValue(buildUser());
      (passwordService.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.loginWithPassword('user@example.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('issues a token pair for a correct password', async () => {
      const { service, prisma, passwordService, tokenService } = buildDeps();
      const user = buildUser();
      prisma.user.findUnique.mockResolvedValue(user);
      (passwordService.compare as jest.Mock).mockResolvedValue(true);
      (tokenService.issueTokenPair as jest.Mock).mockResolvedValue(tokenPair);

      const result = await service.loginWithPassword(
        'user@example.com',
        'correct-password',
        { userAgent: 'jest' },
      );

      expect(passwordService.compare).toHaveBeenCalledWith(
        'correct-password',
        user.passwordHash,
      );
      expect(tokenService.issueTokenPair).toHaveBeenCalledWith(
        { sub: user.id, email: user.email },
        { userAgent: 'jest' },
      );
      expect(result).toEqual({ user, tokens: tokenPair });
    });
  });

  describe('loginWithOAuth', () => {
    function buildProfile(overrides?: Partial<OAuthProfile>): OAuthProfile {
      return {
        provider: 'GOOGLE',
        providerId: 'google-123',
        email: 'user@example.com',
        displayName: 'Profile Name',
        avatar: 'https://example.com/new-avatar.png',
        ...overrides,
      };
    }

    it('creates a brand new user keyed by the provider id field for GOOGLE', async () => {
      const { service, prisma, tokenService } = buildDeps();
      prisma.user.findFirst.mockResolvedValue(null);
      const created = buildUser({ googleId: 'google-123', passwordHash: null });
      prisma.user.create.mockResolvedValue(created);
      (tokenService.issueTokenPair as jest.Mock).mockResolvedValue(tokenPair);

      await service.loginWithOAuth(buildProfile());

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ googleId: 'google-123' }, { email: 'user@example.com' }],
        },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'user@example.com',
          displayName: 'Profile Name',
          avatar: 'https://example.com/new-avatar.png',
          googleId: 'google-123',
        },
      });
    });

    it('creates a brand new user keyed by the provider id field for MICROSOFT', async () => {
      const { service, prisma, tokenService } = buildDeps();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(
        buildUser({ microsoftId: 'ms-123', passwordHash: null }),
      );
      (tokenService.issueTokenPair as jest.Mock).mockResolvedValue(tokenPair);

      await service.loginWithOAuth(
        buildProfile({ provider: 'MICROSOFT', providerId: 'ms-123' }),
      );

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ microsoftId: 'ms-123' }, { email: 'user@example.com' }],
        },
      });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ microsoftId: 'ms-123' }),
        }),
      );
    });

    it('links the provider id onto an existing account found by email, keeping its own display name and avatar', async () => {
      const { service, prisma, tokenService } = buildDeps();
      const existing = buildUser({
        googleId: null,
        displayName: 'Already Set Name',
        avatar: 'https://example.com/already-set.png',
      });
      prisma.user.findFirst.mockResolvedValue(existing);
      prisma.user.update.mockResolvedValue({
        ...existing,
        googleId: 'google-123',
      });
      (tokenService.issueTokenPair as jest.Mock).mockResolvedValue(tokenPair);

      await service.loginWithOAuth(buildProfile());

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: existing.id },
        data: {
          googleId: 'google-123',
          displayName: 'Already Set Name',
          avatar: 'https://example.com/already-set.png',
        },
      });
    });

    it('backfills display name and avatar only when the existing account has none', async () => {
      const { service, prisma, tokenService } = buildDeps();
      const existing = buildUser({
        googleId: 'google-123',
        displayName: null,
        avatar: null,
      });
      prisma.user.findFirst.mockResolvedValue(existing);
      prisma.user.update.mockResolvedValue(existing);
      (tokenService.issueTokenPair as jest.Mock).mockResolvedValue(tokenPair);

      await service.loginWithOAuth(
        buildProfile({
          displayName: 'From Google',
          avatar: 'https://example.com/g.png',
        }),
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: existing.id },
        data: {
          googleId: 'google-123',
          displayName: 'From Google',
          avatar: 'https://example.com/g.png',
        },
      });
    });

    it('issues a token pair for the resulting user', async () => {
      const { service, prisma, tokenService } = buildDeps();
      const created = buildUser();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(created);
      (tokenService.issueTokenPair as jest.Mock).mockResolvedValue(tokenPair);

      const result = await service.loginWithOAuth(buildProfile(), {
        deviceLabel: 'Chrome on macOS',
      });

      expect(tokenService.issueTokenPair).toHaveBeenCalledWith(
        { sub: created.id, email: created.email },
        { deviceLabel: 'Chrome on macOS' },
      );
      expect(result).toEqual({ user: created, tokens: tokenPair });
    });
  });

  describe('verifyEmail', () => {
    it('consumes the token and marks the owning user verified', async () => {
      const { service, prisma, verificationTokenService } = buildDeps();
      (verificationTokenService.consume as jest.Mock).mockResolvedValue({
        userId: 'user-1',
      });

      await service.verifyEmail('a-token');

      expect(verificationTokenService.consume).toHaveBeenCalledWith(
        'a-token',
        VerificationTokenType.EMAIL_VERIFICATION,
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { emailVerifiedAt: expect.any(Date) },
      });
    });
  });

  describe('resendVerificationEmail', () => {
    it('does nothing when the account is already verified', async () => {
      const { service, prisma, verificationTokenService, mailerService } =
        buildDeps();
      prisma.user.findUniqueOrThrow.mockResolvedValue(
        buildUser({ emailVerifiedAt: new Date() }),
      );

      await service.resendVerificationEmail('user-1');

      expect(verificationTokenService.issue).not.toHaveBeenCalled();
      expect(mailerService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('sends a fresh verification email for an unverified account', async () => {
      const { service, prisma, verificationTokenService, mailerService } =
        buildDeps();
      prisma.user.findUniqueOrThrow.mockResolvedValue(
        buildUser({ emailVerifiedAt: null }),
      );
      (verificationTokenService.issue as jest.Mock).mockResolvedValue(
        'verify-token',
      );

      await service.resendVerificationEmail('user-1');

      expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(mailerService.sendVerificationEmail).toHaveBeenCalledWith(
        'user@example.com',
        expect.stringContaining('/verify-email?token=verify-token'),
      );
    });
  });

  describe('forgotPassword', () => {
    it('silently no-ops when no account exists, to avoid leaking account existence', async () => {
      const { service, prisma, verificationTokenService, mailerService } =
        buildDeps();
      prisma.user.findUnique.mockResolvedValue(null);

      await service.forgotPassword('nobody@example.com');

      expect(verificationTokenService.issue).not.toHaveBeenCalled();
      expect(mailerService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('silently no-ops for an OAuth-only account with no password', async () => {
      const { service, prisma, verificationTokenService, mailerService } =
        buildDeps();
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ passwordHash: null }),
      );

      await service.forgotPassword('user@example.com');

      expect(verificationTokenService.issue).not.toHaveBeenCalled();
      expect(mailerService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('silently no-ops for a soft-deleted account', async () => {
      const { service, prisma, verificationTokenService, mailerService } =
        buildDeps();
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ deletedAt: new Date() }),
      );

      await service.forgotPassword('user@example.com');

      expect(verificationTokenService.issue).not.toHaveBeenCalled();
      expect(mailerService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('emails a reset link for a valid password account', async () => {
      const { service, prisma, verificationTokenService, mailerService } =
        buildDeps();
      prisma.user.findUnique.mockResolvedValue(buildUser());
      (verificationTokenService.issue as jest.Mock).mockResolvedValue(
        'reset-token',
      );

      await service.forgotPassword('user@example.com');

      expect(verificationTokenService.issue).toHaveBeenCalledWith(
        'user-1',
        VerificationTokenType.PASSWORD_RESET,
      );
      expect(mailerService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'user@example.com',
        expect.stringContaining('/reset-password?token=reset-token'),
      );
    });
  });

  describe('resetPassword', () => {
    it('consumes the token, hashes the new password, and revokes every active session in one transaction', async () => {
      const { service, prisma, passwordService, verificationTokenService } =
        buildDeps();
      (verificationTokenService.consume as jest.Mock).mockResolvedValue({
        userId: 'user-1',
      });
      (passwordService.hash as jest.Mock).mockResolvedValue('new-hashed-pw');
      prisma.user.update.mockResolvedValue(buildUser());
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await service.resetPassword('reset-token', 'new-password123');

      expect(verificationTokenService.consume).toHaveBeenCalledWith(
        'reset-token',
        VerificationTokenType.PASSWORD_RESET,
      );
      expect(passwordService.hash).toHaveBeenCalledWith('new-password123');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: 'new-hashed-pw' },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('refresh', () => {
    it('delegates to TokenService.rotateRefreshToken', async () => {
      const { service, tokenService } = buildDeps();
      (tokenService.rotateRefreshToken as jest.Mock).mockResolvedValue(
        tokenPair,
      );

      const result = await service.refresh('raw-token', {
        ipAddress: '1.2.3.4',
      });

      expect(tokenService.rotateRefreshToken).toHaveBeenCalledWith(
        'raw-token',
        { ipAddress: '1.2.3.4' },
      );
      expect(result).toBe(tokenPair);
    });
  });

  describe('logout', () => {
    it('delegates to TokenService.revokeRefreshToken', async () => {
      const { service, tokenService } = buildDeps();

      await service.logout('raw-token');

      expect(tokenService.revokeRefreshToken).toHaveBeenCalledWith(
        'raw-token',
      );
    });
  });
});
