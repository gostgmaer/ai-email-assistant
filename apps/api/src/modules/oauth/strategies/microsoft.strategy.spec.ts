import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { MicrosoftStrategy } from './microsoft.strategy';
import type { OAuthStateStore } from '../services/oauth-state.store';

describe('MicrosoftStrategy', () => {
  function buildStrategy() {
    const configService = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string> = {
          MICROSOFT_CLIENT_ID: 'client-id',
          MICROSOFT_CLIENT_SECRET: 'client-secret',
          MICROSOFT_CALLBACK_URL:
            'https://api.example.com/auth/microsoft/callback',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    const stateStore = {} as OAuthStateStore;

    return new MicrosoftStrategy(configService, stateStore);
  }

  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  describe('validate', () => {
    it('prefers the mail field for the account email', () => {
      const strategy = buildStrategy();

      const result = strategy.validate('access-token', 'refresh-token', {
        id: 'ms-user-1',
        displayName: 'Ada Lovelace',
        mail: 'ada@example.com',
        userPrincipalName: 'ada@tenant.onmicrosoft.com',
      });

      expect(result).toEqual({
        profile: {
          provider: 'MICROSOFT',
          providerId: 'ms-user-1',
          email: 'ada@example.com',
          displayName: 'Ada Lovelace',
        },
        tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
      });
    });

    it('falls back to userPrincipalName when mail is absent', () => {
      const strategy = buildStrategy();

      const result = strategy.validate('access-token', 'refresh-token', {
        id: 'ms-user-1',
        userPrincipalName: 'ada@tenant.onmicrosoft.com',
      });

      expect(result.profile.email).toBe('ada@tenant.onmicrosoft.com');
    });

    it('rejects an account with neither mail nor userPrincipalName', () => {
      const strategy = buildStrategy();

      expect(() =>
        strategy.validate('access-token', 'refresh-token', {
          id: 'ms-user-1',
        }),
      ).toThrow(UnauthorizedException);
    });

    it('normalizes an empty-string refresh token to undefined', () => {
      const strategy = buildStrategy();

      const result = strategy.validate('access-token', '', {
        id: 'ms-user-1',
        mail: 'ada@example.com',
      });

      expect(result.tokens.refreshToken).toBeUndefined();
    });
  });

  describe('userProfile', () => {
    it('fetches the Microsoft Graph profile with a bearer token', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ id: 'ms-user-1', mail: 'ada@example.com' }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      const strategy = buildStrategy();

      const { err, profile } = await new Promise<{
        err: unknown;
        profile?: unknown;
      }>((resolve) => {
        strategy.userProfile('access-token', (e, p) =>
          resolve({ err: e, profile: p }),
        );
      });

      expect(err).toBeFalsy();
      expect(profile).toEqual({ id: 'ms-user-1', mail: 'ada@example.com' });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me',
        { headers: { Authorization: 'Bearer access-token' } },
      );
    });

    it('reports an error when Microsoft Graph responds with a failure status', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;
      const strategy = buildStrategy();

      const { err, profile } = await new Promise<{
        err: unknown;
        profile?: unknown;
      }>((resolve) => {
        strategy.userProfile('bad-token', (e, p) =>
          resolve({ err: e, profile: p }),
        );
      });

      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(profile).toBeUndefined();
    });

    it('reports a network failure through the callback instead of throwing', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
      const strategy = buildStrategy();

      const { err } = await new Promise<{ err: unknown; profile?: unknown }>(
        (resolve) => {
          strategy.userProfile('access-token', (e, p) =>
            resolve({ err: e, profile: p }),
          );
        },
      );

      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe('network down');
    });
  });
});
