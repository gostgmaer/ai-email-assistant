import { createHash } from 'crypto';

import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService as NestJwtService } from '@nestjs/jwt';
import ms from 'ms';

import { TokenService } from './token.service';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('TokenService', () => {
  const REFRESH_TTL = '30d';

  function buildDeps() {
    const prisma = {
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const nestJwtService = {
      signAsync: jest.fn().mockResolvedValue('signed.access.token'),
    } as unknown as NestJwtService;

    const configService = {
      getOrThrow: jest.fn().mockReturnValue(REFRESH_TTL),
    } as unknown as ConfigService;

    const service = new TokenService(
      nestJwtService,
      configService,
      prisma as never,
    );

    return { service, prisma, nestJwtService, configService };
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('issueTokenPair', () => {
    it('signs an access token and persists a hashed, TTL-bound refresh token', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const { service, prisma, nestJwtService } = buildDeps();
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const payload = { sub: 'user-1', email: 'user@example.com' };
      const result = await service.issueTokenPair(payload, {
        userAgent: 'jest-agent',
        ipAddress: '127.0.0.1',
        deviceLabel: 'Test Device',
      });

      expect(nestJwtService.signAsync).toHaveBeenCalledWith(payload);
      expect(result.accessToken).toBe('signed.access.token');
      expect(typeof result.refreshToken).toBe('string');
      // randomBytes(48) hex-encoded is 96 hex characters.
      expect(result.refreshToken).toMatch(/^[0-9a-f]{96}$/);

      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          tokenHash: sha256(result.refreshToken),
          expiresAt: new Date(Date.now() + ms(REFRESH_TTL)),
          userAgent: 'jest-agent',
          ipAddress: '127.0.0.1',
          deviceLabel: 'Test Device',
        },
      });
    });

    it('never persists the raw refresh token, only its sha256 hash', async () => {
      const { service, prisma } = buildDeps();
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.issueTokenPair({
        sub: 'user-1',
        email: 'user@example.com',
      });

      const persisted = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(persisted.tokenHash).not.toBe(result.refreshToken);
      expect(persisted.tokenHash).toBe(sha256(result.refreshToken));
    });
  });

  describe('rotateRefreshToken', () => {
    function buildRecord(overrides?: Record<string, unknown>) {
      return {
        id: 'rt-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null as Date | null,
        user: { id: 'user-1', email: 'user@example.com' },
        ...overrides,
      };
    }

    it('rejects a refresh token that does not exist', async () => {
      const { service, prisma } = buildDeps();
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(
        service.rotateRefreshToken('unknown-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a revoked refresh token', async () => {
      const { service, prisma } = buildDeps();
      prisma.refreshToken.findUnique.mockResolvedValue(
        buildRecord({ revokedAt: new Date() }),
      );

      await expect(
        service.rotateRefreshToken('revoked-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an expired refresh token', async () => {
      const { service, prisma } = buildDeps();
      prisma.refreshToken.findUnique.mockResolvedValue(
        buildRecord({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(
        service.rotateRefreshToken('expired-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('looks the token up by its sha256 hash', async () => {
      const { service, prisma } = buildDeps();
      prisma.refreshToken.findUnique.mockResolvedValue(buildRecord());
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-2' });

      await service.rotateRefreshToken('the-raw-token');

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: sha256('the-raw-token') },
        include: { user: true },
      });
    });

    it('revokes the old token and issues a fresh pair for the owning user', async () => {
      const { service, prisma, nestJwtService } = buildDeps();
      const record = buildRecord();
      prisma.refreshToken.findUnique.mockResolvedValue(record);
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-2' });

      const result = await service.rotateRefreshToken('the-raw-token', {
        userAgent: 'jest',
      });

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(nestJwtService.signAsync).toHaveBeenCalledWith({
        sub: 'user-1',
        email: 'user@example.com',
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
      expect(result.accessToken).toBe('signed.access.token');
      expect(result.refreshToken).not.toBe('the-raw-token');
    });
  });

  describe('revokeRefreshToken', () => {
    it('revokes only the matching, still-active token by hash', async () => {
      const { service, prisma } = buildDeps();

      await service.revokeRefreshToken('the-raw-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: sha256('the-raw-token'), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('listActiveSessions', () => {
    function buildSession(overrides?: Record<string, unknown>) {
      return {
        id: 'session-1',
        userAgent: 'jest-agent',
        ipAddress: '127.0.0.1',
        deviceLabel: 'Test Device',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        tokenHash: 'hash-1',
        ...overrides,
      };
    }

    it('queries only non-revoked, unexpired sessions for the user, newest first', async () => {
      const { service, prisma } = buildDeps();
      prisma.refreshToken.findMany.mockResolvedValue([]);

      await service.listActiveSessions('user-1');

      expect(prisma.refreshToken.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('flags the session matching the current refresh token as isCurrent', async () => {
      const { service, prisma } = buildDeps();
      const current = buildSession({
        id: 'session-1',
        tokenHash: sha256('current-token'),
      });
      const other = buildSession({
        id: 'session-2',
        tokenHash: 'some-other-hash',
      });
      prisma.refreshToken.findMany.mockResolvedValue([current, other]);

      const sessions = await service.listActiveSessions(
        'user-1',
        'current-token',
      );

      expect(sessions).toEqual([
        expect.objectContaining({ id: 'session-1', isCurrent: true }),
        expect.objectContaining({ id: 'session-2', isCurrent: false }),
      ]);
    });

    it('marks every session as not current when no current token is supplied', async () => {
      const { service, prisma } = buildDeps();
      prisma.refreshToken.findMany.mockResolvedValue([buildSession()]);

      const sessions = await service.listActiveSessions('user-1');

      expect(sessions[0].isCurrent).toBe(false);
    });
  });

  describe('revokeSessionById', () => {
    it('scopes the revoke to the owning user, so one user cannot revoke another user\'s session', async () => {
      const { service, prisma } = buildDeps();

      await service.revokeSessionById('user-1', 'session-1');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('revokeAllSessions', () => {
    it('revokes every active session for the user when nothing is excluded', async () => {
      const { service, prisma } = buildDeps();

      await service.revokeAllSessions('user-1');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('excludes the current session by hash when asked to keep it alive', async () => {
      const { service, prisma } = buildDeps();

      await service.revokeAllSessions('user-1', 'keep-this-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          revokedAt: null,
          tokenHash: { not: sha256('keep-this-token') },
        },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
