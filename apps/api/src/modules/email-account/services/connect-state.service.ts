import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { OAuthProviderName } from '../../oauth/interfaces';

const CONNECT_STATE_TTL = '10m';

/** Shared CSRF-state infra for any "connect a third-party account" OAuth
 * flow (mail, calendar, ...) — not specific to email despite living in
 * this module. `purpose` keeps a calendar-connect state token from being
 * replayed as an email-connect one (or vice versa): each flow passes its
 * own literal string and both create/verify must agree on it. */
export type ConnectPurpose = 'email-connect' | 'calendar-connect';

interface ConnectStatePayload {
  purpose: ConnectPurpose;
  provider: OAuthProviderName;
  sub: string;
}

@Injectable()
export class ConnectStateService {
  constructor(private readonly jwtService: JwtService) {}

  async createState(
    purpose: ConnectPurpose,
    provider: OAuthProviderName,
    userId: string,
  ): Promise<string> {
    const payload: ConnectStatePayload = {
      purpose,
      provider,
      sub: userId,
    };

    return this.jwtService.signAsync(payload, {
      expiresIn: CONNECT_STATE_TTL,
    });
  }

  async verifyState(
    purpose: ConnectPurpose,
    token: string,
    provider: OAuthProviderName,
  ): Promise<string> {
    if (!token) {
      throw new UnauthorizedException('Missing OAuth connect state');
    }

    let payload: ConnectStatePayload;

    try {
      payload = await this.jwtService.verifyAsync<ConnectStatePayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired OAuth connect state');
    }

    if (payload.purpose !== purpose || payload.provider !== provider) {
      throw new UnauthorizedException('Invalid OAuth connect state');
    }

    return payload.sub;
  }
}
