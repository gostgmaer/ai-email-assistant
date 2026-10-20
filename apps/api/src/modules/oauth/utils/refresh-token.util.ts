import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { OAuthProviderName } from '../interfaces';

/** The stored OAuth grant is no longer usable and only a user reconnect
 * can fix it. Extends BadRequestException (what every refresh failure
 * threw before), so existing HTTP behavior is unchanged. */
export class OAuthReconnectRequiredException extends BadRequestException {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthReconnectRequiredException';
  }
}

export interface RefreshedOAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

/** Google's and Microsoft's OAuth token-refresh endpoints take an identical
 * request shape, so any "connect a third-party account" flow (mail,
 * calendar, ...) that stores a refresh token can share this instead of
 * reimplementing it — see EmailAccountService's prior private version,
 * which this was extracted from once CalendarAccountService needed the
 * same logic. */
export async function refreshOAuthToken(
  provider: OAuthProviderName,
  refreshToken: string,
  configService: ConfigService,
): Promise<RefreshedOAuthToken> {
  const tokenUrl =
    provider === 'GOOGLE'
      ? 'https://oauth2.googleapis.com/token'
      : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

  const clientId = configService.getOrThrow<string>(
    provider === 'GOOGLE' ? 'GOOGLE_CLIENT_ID' : 'MICROSOFT_CLIENT_ID',
  );
  const clientSecret = configService.getOrThrow<string>(
    provider === 'GOOGLE' ? 'GOOGLE_CLIENT_SECRET' : 'MICROSOFT_CLIENT_SECRET',
  );

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    // 400/401 from the token endpoint means the grant itself is gone
    // (invalid_grant: revoked, expired, password changed) — a retry will
    // fail identically. Anything else (5xx, 429) may be transient.
    if (response.status === 400 || response.status === 401) {
      throw new OAuthReconnectRequiredException(
        `${provider} rejected the stored refresh token; reconnect this account`,
      );
    }
    throw new BadRequestException(
      `Failed to refresh ${provider} access token; reconnect this account`,
    );
  }

  const json = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
  };
}
