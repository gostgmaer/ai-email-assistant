import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../database';
import { EncryptionService } from '../../../infrastructure/encryption';
import { CalendarAccountModel } from '../../../generated/prisma/models';
import { refreshOAuthToken } from '../../oauth';
import { CalendarConnectResult } from '../interfaces';

@Injectable()
export class CalendarAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
  ) {}

  async listForUser(userId: string): Promise<CalendarAccountModel[]> {
    return this.prisma.calendarAccount.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getOwnedAccountOrThrow(
    userId: string,
    accountId: string,
  ): Promise<CalendarAccountModel> {
    const account = await this.prisma.calendarAccount.findUnique({
      where: { id: accountId },
    });

    if (!account || account.deletedAt) {
      throw new NotFoundException('Calendar account not found');
    }

    if (account.userId !== userId) {
      throw new ForbiddenException('You do not own this calendar account');
    }

    return account;
  }

  async connectOAuthAccount(
    result: CalendarConnectResult,
  ): Promise<CalendarAccountModel> {
    const { userId, profile, tokens } = result;

    const existing = await this.prisma.calendarAccount.findUnique({
      where: {
        provider_email: { provider: profile.provider, email: profile.email },
      },
    });

    if (existing && existing.userId !== userId) {
      throw new ConflictException(
        'This calendar is already connected to a different account',
      );
    }

    const isFirstAccount =
      !existing &&
      (await this.prisma.calendarAccount.count({
        where: { userId, deletedAt: null },
      })) === 0;

    const encryptedAccessToken = this.encryptionService.encrypt(
      tokens.accessToken,
    );
    const encryptedRefreshToken = tokens.refreshToken
      ? this.encryptionService.encrypt(tokens.refreshToken)
      : null;

    const account = await this.prisma.calendarAccount.upsert({
      where: {
        provider_email: { provider: profile.provider, email: profile.email },
      },
      create: {
        userId,
        provider: profile.provider,
        email: profile.email,
        displayName: profile.displayName,
        isPrimary: isFirstAccount,
        deletedAt: null,
        credential: {
          create: {
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            expiresAt: tokens.expiresAt,
          },
        },
      },
      update: {
        displayName: profile.displayName,
        deletedAt: null,
      },
    });

    await this.prisma.calendarCredential.upsert({
      where: { accountId: account.id },
      create: {
        accountId: account.id,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: tokens.expiresAt,
      },
      update: {
        accessToken: encryptedAccessToken,
        // A reconnect may not always return a fresh refresh token
        // (e.g. Google only issues one on first consent); keep the old one.
        ...(encryptedRefreshToken
          ? { refreshToken: encryptedRefreshToken }
          : {}),
        expiresAt: tokens.expiresAt,
      },
    });

    return account;
  }

  async disconnect(userId: string, accountId: string): Promise<void> {
    await this.getOwnedAccountOrThrow(userId, accountId);

    await this.prisma.$transaction([
      this.prisma.calendarAccount.update({
        where: { id: accountId },
        data: { deletedAt: new Date() },
      }),
      this.prisma.calendarCredential.deleteMany({ where: { accountId } }),
    ]);
  }

  /** Decrypted, refreshed-if-needed access token. */
  async getValidAccessToken(accountId: string): Promise<string> {
    const account = await this.prisma.calendarAccount.findUniqueOrThrow({
      where: { id: accountId },
      include: { credential: true },
    });

    if (!account.credential) {
      throw new NotFoundException('No credentials stored for this account');
    }

    const expiresAt = account.credential.expiresAt;
    const isExpiringSoon =
      !expiresAt || expiresAt.getTime() - Date.now() < 60_000;

    if (!isExpiringSoon) {
      return this.encryptionService.decrypt(account.credential.accessToken);
    }

    if (!account.credential.refreshToken) {
      throw new BadRequestException(
        'Access token expired and no refresh token is stored; reconnect this account',
      );
    }

    const refreshToken = this.encryptionService.decrypt(
      account.credential.refreshToken,
    );

    const refreshed = await refreshOAuthToken(
      account.provider,
      refreshToken,
      this.configService,
    );

    const encryptedAccessToken = this.encryptionService.encrypt(
      refreshed.accessToken,
    );

    await this.prisma.calendarCredential.update({
      where: { accountId },
      data: {
        accessToken: encryptedAccessToken,
        expiresAt: refreshed.expiresAt,
        ...(refreshed.refreshToken
          ? {
              refreshToken: this.encryptionService.encrypt(
                refreshed.refreshToken,
              ),
            }
          : {}),
      },
    });

    return refreshed.accessToken;
  }
}
