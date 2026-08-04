import { createHash, randomBytes } from 'crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import ms from 'ms';

import { PrismaService } from '../../../database';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly nestJwtService: NestJwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async issueTokenPair(payload: JwtPayload): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.nestJwtService.signAsync(payload),
      this.createRefreshToken(payload.sub),
    ]);

    return { accessToken, refreshToken };
  }

  async rotateRefreshToken(refreshToken: string): Promise<TokenPair> {
    const tokenHash = this.hashToken(refreshToken);

    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair({
      sub: record.user.id,
      email: record.user.email,
    });
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(token);

    const refreshExpiresIn = this.configService.getOrThrow<string>(
      'JWT_REFRESH_EXPIRES_IN',
    ) as ms.StringValue;

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + ms(refreshExpiresIn)),
      },
    });

    return token;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
