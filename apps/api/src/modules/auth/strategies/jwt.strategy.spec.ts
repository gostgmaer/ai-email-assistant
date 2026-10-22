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

  it('reads the signing secret from JWT_SECRET at construction', () => {
    const configService = buildConfigService('test-secret');

    new JwtStrategy(configService);

    expect(configService.getOrThrow).toHaveBeenCalledWith('JWT_SECRET');
  });

  it('fails fast when JWT_SECRET is not configured, rather than falling back to a default', () => {
    const configService = buildConfigService(
      new Error('JWT_SECRET is not defined'),
    );

    expect(() => new JwtStrategy(configService)).toThrow(
      'JWT_SECRET is not defined',
    );
  });

  const user: JwtPayload = { sub: 'user-1', email: 'user@example.com' };
  const ticket: JwtPayload = { ...user, purpose: 'connect' };
  const viaHeader = (path = '/inbox') =>
    ({
      path,
      headers: { authorization: 'Bearer x' },
      query: {},
    }) as unknown as Request;
  const viaUrl = (path: string) =>
    ({ path, headers: {}, query: { ticket: 'x' } }) as unknown as Request;

  it('accepts an access token from the Authorization header', () => {
    const strategy = new JwtStrategy(buildConfigService());

    expect(strategy.validate(viaHeader(), user)).toEqual(user);
  });

  it('accepts a connect ticket from the URL of a connect route', () => {
    const strategy = new JwtStrategy(buildConfigService());

    expect(
      strategy.validate(viaUrl('/email-accounts/connect/google'), ticket),
    ).toEqual(user);
  });

  it.each([
    [
      'an access token in the URL',
      viaUrl('/email-accounts/connect/google'),
      user,
    ],
    ['a ticket on a non-connect route', viaUrl('/email/threads'), ticket],
    ['a ticket used as a bearer token', viaHeader(), ticket],
  ])('refuses %s', (_label, req, payload) => {
    const strategy = new JwtStrategy(buildConfigService());

    expect(() => strategy.validate(req, payload)).toThrow(
      UnauthorizedException,
    );
  });
});
