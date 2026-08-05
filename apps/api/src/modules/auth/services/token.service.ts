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

export interface DeviceMetadata {
  userAgent?: string;
  ipAddress?: string;
  deviceLabel?: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly nestJwtService: NestJwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async issueTokenPair(
    payload: JwtPayload,
    device?: DeviceMetadata,
  ): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.nestJwtService.signAsync(payload),
      this.createRefreshToken(payload.sub, device),
    ]);

    return { accessToken, refreshToken };
  }

  async rotateRefreshToken(
    refreshToken: string,
    device?: DeviceMetadata,
  ): Promise<TokenPair> {
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

    return this.issueTokenPair(
      { sub: record.user.id, email: record.user.email },
      device,
    );
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async listActiveSessions(userId: string, currentRefreshToken?: string) {
    const currentHash = currentRefreshToken
      ? this.hashToken(currentRefreshToken)
      : null;

    const sessions = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      deviceLabel: session.deviceLabel,
      createdAt: session.createdAt,
      isCurrent: currentHash !== null && session.tokenHash === currentHash,
    }));
  }

  async revokeSessionById(userId: string, sessionId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(
    userId: string,
    exceptRefreshToken?: string,
  ): Promise<void> {
    const exceptHash = exceptRefreshToken
      ? this.hashToken(exceptRefreshToken)
      : undefined;

    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptHash ? { tokenHash: { not: exceptHash } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  private async createRefreshToken(
    userId: string,
    device?: DeviceMetadata,
  ): Promise<string> {
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
        userAgent: device?.userAgent,
        ipAddress: device?.ipAddress,
        deviceLabel: device?.deviceLabel,
      },
    });

    return token;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
