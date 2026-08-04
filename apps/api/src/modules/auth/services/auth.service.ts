import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../database';
import { OAuthProfile } from '../../oauth/interfaces';
import { UserModel } from '../../../generated/prisma/models';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { TokenPair, TokenService } from './token.service';

export interface OAuthLoginResult {
  user: UserModel;
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async loginWithOAuth(profile: OAuthProfile): Promise<OAuthLoginResult> {
    const user = await this.findOrCreateUser(profile);

    const payload: JwtPayload = { sub: user.id, email: user.email };
    const tokens = await this.tokenService.issueTokenPair(payload);

    return { user, tokens };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokenService.rotateRefreshToken(refreshToken);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokenService.revokeRefreshToken(refreshToken);
  }

  private async findOrCreateUser(profile: OAuthProfile): Promise<UserModel> {
    const providerIdField =
      profile.provider === 'GOOGLE' ? 'googleId' : 'microsoftId';

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { [providerIdField]: profile.providerId },
          { email: profile.email },
        ],
      },
    });

    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          [providerIdField]: profile.providerId,
          displayName: existing.displayName ?? profile.displayName,
          avatar: existing.avatar ?? profile.avatar,
        },
      });
    }

    return this.prisma.user.create({
      data: {
        email: profile.email,
        displayName: profile.displayName,
        avatar: profile.avatar,
        [providerIdField]: profile.providerId,
      },
    });
  }
}
