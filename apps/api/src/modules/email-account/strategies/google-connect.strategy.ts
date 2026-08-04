import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import {
  GoogleCallbackParameters,
  Profile,
  Strategy,
  StrategyOptionsWithRequest,
} from 'passport-google-oauth20';

import { MailConnectResult } from '../interfaces';
import { ConnectStateService } from '../services/connect-state.service';

const GMAIL_SCOPES = [
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

@Injectable()
export class GoogleConnectStrategy extends PassportStrategy(
  Strategy,
  'google-connect',
  true,
) {
  constructor(
    configService: ConfigService,
    private readonly connectStateService: ConnectStateService,
  ) {
    const options: StrategyOptionsWithRequest = {
      clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('GOOGLE_MAIL_CALLBACK_URL'),
      scope: GMAIL_SCOPES,
      passReqToCallback: true,
    };

    super(options);
  }

  async validate(
    req: Request,
    accessToken: string,
    refreshToken: string,
    params: GoogleCallbackParameters,
    profile: Profile,
  ): Promise<MailConnectResult> {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      throw new UnauthorizedException(
        'Google account has no accessible email address',
      );
    }

    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const userId = await this.connectStateService.verifyState(state, 'GOOGLE');

    return {
      userId,
      profile: {
        provider: 'GOOGLE',
        email,
        displayName: profile.displayName,
      },
      tokens: {
        accessToken,
        refreshToken: refreshToken || undefined,
        expiresAt: params.expires_in
          ? new Date(Date.now() + params.expires_in * 1000)
          : undefined,
      },
    };
  }
}
