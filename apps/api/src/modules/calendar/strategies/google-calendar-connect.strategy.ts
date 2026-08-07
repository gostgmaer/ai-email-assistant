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

import { ConnectStateService } from '../../email-account';
import { CalendarConnectResult } from '../interfaces';

// Read/write on events (create/schedule meetings) plus free/busy lookups —
// narrower than full calendar management, which isn't needed here.
const CALENDAR_SCOPES = [
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];

@Injectable()
export class GoogleCalendarConnectStrategy extends PassportStrategy(
  Strategy,
  'google-calendar-connect',
  true,
) {
  constructor(
    configService: ConfigService,
    private readonly connectStateService: ConnectStateService,
  ) {
    const options: StrategyOptionsWithRequest = {
      clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>(
        'GOOGLE_CALENDAR_CALLBACK_URL',
      ),
      scope: CALENDAR_SCOPES,
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
  ): Promise<CalendarConnectResult> {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      throw new UnauthorizedException(
        'Google account has no accessible email address',
      );
    }

    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const userId = await this.connectStateService.verifyState(
      'calendar-connect',
      state,
      'GOOGLE',
    );

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
