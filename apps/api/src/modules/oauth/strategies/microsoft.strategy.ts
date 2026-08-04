import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import OAuth2Strategy from 'passport-oauth2';

import { OAuthValidationResult } from '../interfaces/oauth-provider.interface';
import { OAuthStateStore } from '../services/oauth-state.store';

interface MicrosoftGraphProfile {
  id: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
}

const AUTHORIZATION_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const PROFILE_URL = 'https://graph.microsoft.com/v1.0/me';

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(
  OAuth2Strategy,
  'microsoft',
) {
  constructor(configService: ConfigService, stateStore: OAuthStateStore) {
    super({
      authorizationURL: AUTHORIZATION_URL,
      tokenURL: TOKEN_URL,
      clientID: configService.getOrThrow<string>('MICROSOFT_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('MICROSOFT_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('MICROSOFT_CALLBACK_URL'),
      scope: ['openid', 'profile', 'email', 'User.Read'],
      state: true,
      store: stateStore,
    });
  }

  userProfile(
    accessToken: string,
    done: (err?: unknown, profile?: MicrosoftGraphProfile) => void,
  ): void {
    fetch(PROFILE_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new UnauthorizedException(
            `Failed to fetch Microsoft profile (${response.status})`,
          );
        }

        const profile = (await response.json()) as MicrosoftGraphProfile;
        done(null, profile);
      })
      .catch((error: unknown) => done(error));
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: MicrosoftGraphProfile,
  ): OAuthValidationResult {
    const email = profile.mail ?? profile.userPrincipalName;

    if (!email) {
      throw new UnauthorizedException(
        'Microsoft account has no accessible email address',
      );
    }

    return {
      profile: {
        provider: 'MICROSOFT',
        providerId: profile.id,
        email,
        displayName: profile.displayName,
      },
      tokens: {
        accessToken,
        refreshToken: refreshToken || undefined,
      },
    };
  }
}
