import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { refreshOAuthToken } from './refresh-token.util';

describe('refreshOAuthToken', () => {
  function buildConfigService() {
    return {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string> = {
          GOOGLE_CLIENT_ID: 'google-client-id',
          GOOGLE_CLIENT_SECRET: 'google-client-secret',
          MICROSOFT_CLIENT_ID: 'microsoft-client-id',
          MICROSOFT_CLIENT_SECRET: 'microsoft-client-secret',
        };
        return values[key];
      }),
    } as unknown as ConfigService;
  }

  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  it('refreshes a Google token against the Google token endpoint with Google credentials', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const result = await refreshOAuthToken(
      'GOOGLE',
      'old-refresh-token',
      buildConfigService(),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(init.method).toBe('POST');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('client_id')).toBe('google-client-id');
    expect(body.get('client_secret')).toBe('google-client-secret');
    expect(body.get('refresh_token')).toBe('old-refresh-token');
    expect(body.get('grant_type')).toBe('refresh_token');

    expect(result).toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });
  });

  it('refreshes a Microsoft token against the Microsoft token endpoint with Microsoft credentials', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'new-access-token' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await refreshOAuthToken('MICROSOFT', 'old-refresh-token', buildConfigService());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('client_id')).toBe('microsoft-client-id');
    expect(body.get('client_secret')).toBe('microsoft-client-secret');
  });

  it('leaves expiresAt and refreshToken undefined when the response omits them', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'new-access-token' }),
    }) as unknown as typeof fetch;

    const result = await refreshOAuthToken(
      'GOOGLE',
      'old-token',
      buildConfigService(),
    );

    expect(result.expiresAt).toBeUndefined();
    expect(result.refreshToken).toBeUndefined();
  });

  it('throws BadRequestException when the token endpoint rejects the refresh token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
    }) as unknown as typeof fetch;

    await expect(
      refreshOAuthToken('GOOGLE', 'revoked-token', buildConfigService()),
    ).rejects.toThrow(BadRequestException);
  });
});
