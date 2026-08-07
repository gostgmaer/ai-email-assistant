import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, StrategyOptions } from 'passport-google-oauth20';

import { OAuthValidationResult } from '../interfaces/oauth-provider.interface';
import { OAuthStateStore } from '../services/oauth-state.store';

// Login requests the union of identity + Gmail + Calendar scopes in one
// consent screen, so AuthController.handleOAuthCallback can auto-connect a
// mailbox and calendar from the same grant — no separate manual "connect"
// step for OAuth users. Password-registered users have no OAuth grant at
// all, so they still connect manually via the email-accounts/calendar
// settings pages (see docs/v1.2-plan.md-adjacent design note: this only
// applies to the login flow, not password auth).
const LOGIN_SCOPES = [
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService, stateStore: OAuthStateStore) {
    const options: StrategyOptions = {
      clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: LOGIN_SCOPES,
      state: true,
      store: stateStore,
    };

    super(options);
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ): OAuthValidationResult {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      throw new UnauthorizedException(
        'Google account has no accessible email address',
      );
    }

    return {
      profile: {
        provider: 'GOOGLE',
        providerId: profile.id,
        email,
        displayName: profile.displayName,
        avatar: profile.photos?.[0]?.value,
      },
      tokens: {
        accessToken,
        refreshToken: refreshToken || undefined,
      },
    };
  }
}
