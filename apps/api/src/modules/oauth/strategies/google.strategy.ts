import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, StrategyOptions } from 'passport-google-oauth20';

import { OAuthValidationResult } from '../interfaces/oauth-provider.interface';
import { OAuthStateStore } from '../services/oauth-state.store';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService, stateStore: OAuthStateStore) {
    const options: StrategyOptions = {
      clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
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
