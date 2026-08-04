import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { OAuthProviderName } from '../../oauth/interfaces';

const CONNECT_STATE_TTL = '10m';
const CONNECT_STATE_PURPOSE = 'email-connect';

interface ConnectStatePayload {
  purpose: typeof CONNECT_STATE_PURPOSE;
  provider: OAuthProviderName;
  sub: string;
}

@Injectable()
export class ConnectStateService {
  constructor(private readonly jwtService: JwtService) {}

  async createState(
    provider: OAuthProviderName,
    userId: string,
  ): Promise<string> {
    const payload: ConnectStatePayload = {
      purpose: CONNECT_STATE_PURPOSE,
      provider,
      sub: userId,
    };

    return this.jwtService.signAsync(payload, {
      expiresIn: CONNECT_STATE_TTL,
    });
  }

  async verifyState(
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

    if (
      payload.purpose !== CONNECT_STATE_PURPOSE ||
      payload.provider !== provider
    ) {
      throw new UnauthorizedException('Invalid OAuth connect state');
    }

    return payload.sub;
  }
}
