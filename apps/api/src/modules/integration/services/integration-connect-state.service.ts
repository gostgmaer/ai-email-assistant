import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

const CONNECT_STATE_TTL = '10m';

/** CSRF-state infra for "connect an integration" OAuth flows (Slack, and
 * whatever else follows it — see IntegrationProvider). Not the same
 * shape as email-account's ConnectStateService: an integration is scoped
 * to an EmailAccount, not just a user, so the state has to carry
 * accountId too. Deliberately its own small service rather than
 * generalizing ConnectStateService — that one is shared by two existing,
 * working flows (mail, calendar) and isn't worth risking for a third,
 * differently-shaped consumer. */
export type IntegrationProviderName = 'SLACK';

interface IntegrationConnectStatePayload {
  purpose: 'integration-connect';
  provider: IntegrationProviderName;
  userId: string;
  accountId: string;
}

@Injectable()
export class IntegrationConnectStateService {
  constructor(private readonly jwtService: JwtService) {}

  async createState(
    provider: IntegrationProviderName,
    userId: string,
    accountId: string,
  ): Promise<string> {
    const payload: IntegrationConnectStatePayload = {
      purpose: 'integration-connect',
      provider,
      userId,
      accountId,
    };

    return this.jwtService.signAsync(payload, {
      expiresIn: CONNECT_STATE_TTL,
    });
  }

  async verifyState(
    token: string,
    provider: IntegrationProviderName,
  ): Promise<{ userId: string; accountId: string }> {
    if (!token) {
      throw new UnauthorizedException('Missing OAuth connect state');
    }

    let payload: IntegrationConnectStatePayload;

    try {
      payload =
        await this.jwtService.verifyAsync<IntegrationConnectStatePayload>(
          token,
        );
    } catch {
      throw new UnauthorizedException('Invalid or expired OAuth connect state');
    }

    if (
      payload.purpose !== 'integration-connect' ||
      payload.provider !== provider
    ) {
      throw new UnauthorizedException('Invalid OAuth connect state');
    }

    return { userId: payload.userId, accountId: payload.accountId };
  }
}
