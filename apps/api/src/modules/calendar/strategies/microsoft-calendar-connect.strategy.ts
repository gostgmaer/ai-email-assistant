import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import OAuth2Strategy from 'passport-oauth2';

import { ConnectStateService } from '../../email-account';
import { CalendarConnectResult } from '../interfaces';

interface MicrosoftGraphProfile {
  id: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
}

interface MicrosoftTokenResult {
  expires_in?: number;
}

const AUTHORIZATION_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const PROFILE_URL = 'https://graph.microsoft.com/v1.0/me';

const CALENDAR_SCOPES = [
  'openid',
  'email',
  'offline_access',
  'https://graph.microsoft.com/Calendars.ReadWrite',
];

@Injectable()
export class MicrosoftCalendarConnectStrategy extends PassportStrategy(
  OAuth2Strategy,
  'microsoft-calendar-connect',
  true,
) {
  constructor(
    configService: ConfigService,
    private readonly connectStateService: ConnectStateService,
  ) {
    super({
      authorizationURL: AUTHORIZATION_URL,
      tokenURL: TOKEN_URL,
      clientID: configService.getOrThrow<string>('MICROSOFT_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('MICROSOFT_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>(
        'MICROSOFT_CALENDAR_CALLBACK_URL',
      ),
      scope: CALENDAR_SCOPES,
      passReqToCallback: true,
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

  async validate(
    req: Request,
    accessToken: string,
    refreshToken: string,
    results: MicrosoftTokenResult,
    profile: MicrosoftGraphProfile,
  ): Promise<CalendarConnectResult> {
    const email = profile.mail ?? profile.userPrincipalName;

    if (!email) {
      throw new UnauthorizedException(
        'Microsoft account has no accessible email address',
      );
    }

    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const userId = await this.connectStateService.verifyState(
      'calendar-connect',
      state,
      'MICROSOFT',
    );

    return {
      userId,
      profile: {
        provider: 'MICROSOFT',
        email,
        displayName: profile.displayName,
      },
      tokens: {
        accessToken,
        refreshToken: refreshToken || undefined,
        expiresAt: results.expires_in
          ? new Date(Date.now() + results.expires_in * 1000)
          : undefined,
      },
    };
  }
}
