import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { JwtStrategy } from './jwt.strategy';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

describe('JwtStrategy', () => {
  function buildConfigService(secret: string | Error = 'test-secret') {
    return {
      getOrThrow: jest.fn(() => {
        if (secret instanceof Error) throw secret;
        return secret;
      }),
    } as unknown as ConfigService;
  }

  const liveSession = {
    userId: 'user-1',
    revokedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    user: { deletedAt: null as Date | null },
  };

  function build(session: typeof liveSession | null = liveSession) {
    const prisma = {
      refreshToken: { findUnique: jest.fn().mockResolvedValue(session) },
    };
    const strategy = new JwtStrategy(buildConfigService(), prisma as never);
    return { strategy, prisma };
  }

  it('reads the signing secret from JWT_SECRET at construction', () => {
    const configService = buildConfigService('test-secret');

    new JwtStrategy(configService, {} as never);

    expect(configService.getOrThrow).toHaveBeenCalledWith('JWT_SECRET');
  });

  it('fails fast when JWT_SECRET is not configured, rather than falling back to a default', () => {
    const configService = buildConfigService(
      new Error('JWT_SECRET is not defined'),
    );

    expect(() => new JwtStrategy(configService, {} as never)).toThrow(
      'JWT_SECRET is not defined',
    );
  });

  const user: JwtPayload = {
    sub: 'user-1',
    email: 'user@example.com',
    sid: 'session-1',
  };
  const ticket: JwtPayload = { ...user, purpose: 'connect' };
  const viaHeader = (path = '/inbox') =>
    ({
      path,
      headers: { authorization: 'Bearer x' },
      query: {},
    }) as unknown as Request;
  const viaUrl = (path: string) =>
    ({ path, headers: {}, query: { ticket: 'x' } }) as unknown as Request;

  it('accepts an access token from the Authorization header while its session is live', async () => {
    const { strategy, prisma } = build();

    await expect(strategy.validate(viaHeader(), user)).resolves.toEqual(user);
    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'session-1' } }),
    );
  });

  it('accepts a connect ticket from the URL of a connect route', async () => {
    const { strategy } = build();

    await expect(
      strategy.validate(viaUrl('/email-accounts/connect/google'), ticket),
    ).resolves.toEqual(user);
  });

  it.each([
    [
      'an access token in the URL',
      viaUrl('/email-accounts/connect/google'),
      user,
    ],
    ['a ticket on a non-connect route', viaUrl('/email/threads'), ticket],
    ['a ticket used as a bearer token', viaHeader(), ticket],
  ])('refuses %s', async (_label, req, payload) => {
    const { strategy } = build();

    await expect(strategy.validate(req, payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each([
    ['its session was signed out', { ...liveSession, revokedAt: new Date() }],
    [
      'its session has expired',
      { ...liveSession, expiresAt: new Date(Date.now() - 1000) },
    ],
    [
      'its user was deleted',
      { ...liveSession, user: { deletedAt: new Date() } },
    ],
    ['its session belongs to someone else', { ...liveSession, userId: 'x' }],
    ['its session no longer exists', null],
  ])('refuses a token once %s', async (_label, session) => {
    const { strategy } = build(session);

    await expect(strategy.validate(viaHeader(), user)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a token that carries no session at all', async () => {
    const { strategy, prisma } = build();

    await expect(
      strategy.validate(viaHeader(), { sub: 'user-1', email: 'u@x.com' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
  });
});
