import type { ConfigService } from '@nestjs/config';

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

  it('passes the verified payload straight through unchanged', () => {
    const strategy = new JwtStrategy(buildConfigService());
    const payload: JwtPayload = { sub: 'user-1', email: 'user@example.com' };

    expect(strategy.validate(payload)).toBe(payload);
  });
});
