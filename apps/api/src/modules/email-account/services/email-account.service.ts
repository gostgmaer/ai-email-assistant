import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';

import { PrismaService } from '../../../database';
import { EncryptionService } from '../../../infrastructure/encryption';
import { QueueService } from '../../../infrastructure/queue';
import { EmailAccountModel } from '../../../generated/prisma/models';
import type { InputJsonObject } from '../../../generated/prisma/internal/prismaNamespace';
import { ConnectImapDto } from '../dto';
import { ImapConfig, MailConnectResult } from '../interfaces';

@Injectable()
export class EmailAccountService {
  private readonly logger = new Logger(EmailAccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
    private readonly queueService: QueueService,
  ) {}

  async listForUser(userId: string): Promise<EmailAccountModel[]> {
    return this.prisma.emailAccount.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getOwnedAccountOrThrow(
    userId: string,
    accountId: string,
  ): Promise<EmailAccountModel> {
    const account = await this.prisma.emailAccount.findUnique({
      where: { id: accountId },
    });

    if (!account || account.deletedAt) {
      throw new NotFoundException('Email account not found');
    }

    if (account.userId !== userId) {
      throw new ForbiddenException('You do not own this email account');
    }

    return account;
  }

  async connectOAuthAccount(
    result: MailConnectResult,
  ): Promise<EmailAccountModel> {
    const { userId, profile, tokens } = result;

    const existing = await this.prisma.emailAccount.findUnique({
      where: {
        provider_email: { provider: profile.provider, email: profile.email },
      },
    });

    if (existing && existing.userId !== userId) {
      throw new ConflictException(
        'This mailbox is already connected to a different account',
      );
    }

    const isFirstAccount =
      !existing &&
      (await this.prisma.emailAccount.count({
        where: { userId, deletedAt: null },
      })) === 0;

    const encryptedAccessToken = this.encryptionService.encrypt(
      tokens.accessToken,
    );
    const encryptedRefreshToken = tokens.refreshToken
      ? this.encryptionService.encrypt(tokens.refreshToken)
      : null;

    const account = await this.prisma.emailAccount.upsert({
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
        syncEnabled: true,
      },
    });

    await this.prisma.emailCredential.upsert({
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

    await this.queueService.enqueueInitialSync(account.id);

    return account;
  }

  async connectImap(
    userId: string,
    dto: ConnectImapDto,
  ): Promise<EmailAccountModel> {
    const imapSecure = dto.imapSecure ?? true;
    const smtpSecure = dto.smtpSecure ?? true;

    await this.verifyImapCredentials({
      host: dto.imapHost,
      port: dto.imapPort,
      secure: imapSecure,
      username: dto.username,
      password: dto.password,
    });

    const existing = await this.prisma.emailAccount.findUnique({
      where: { provider_email: { provider: 'IMAP', email: dto.email } },
    });

    if (existing && existing.userId !== userId) {
      throw new ConflictException(
        'This mailbox is already connected to a different account',
      );
    }

    const isFirstAccount =
      !existing &&
      (await this.prisma.emailAccount.count({
        where: { userId, deletedAt: null },
      })) === 0;

    const imapConfig: ImapConfig = {
      username: dto.username,
      imap: { host: dto.imapHost, port: dto.imapPort, secure: imapSecure },
      smtp: { host: dto.smtpHost, port: dto.smtpPort, secure: smtpSecure },
    };

    const encryptedPassword = this.encryptionService.encrypt(dto.password);

    const account = await this.prisma.emailAccount.upsert({
      where: { provider_email: { provider: 'IMAP', email: dto.email } },
      create: {
        userId,
        provider: 'IMAP',
        email: dto.email,
        displayName: dto.displayName,
        isPrimary: isFirstAccount,
        imapConfig: imapConfig as unknown as InputJsonObject,
        deletedAt: null,
        credential: {
          create: { accessToken: encryptedPassword },
        },
      },
      update: {
        displayName: dto.displayName,
        imapConfig: imapConfig as unknown as InputJsonObject,
        deletedAt: null,
        syncEnabled: true,
      },
    });

    await this.prisma.emailCredential.upsert({
      where: { accountId: account.id },
      create: { accountId: account.id, accessToken: encryptedPassword },
      update: { accessToken: encryptedPassword },
    });

    await this.queueService.enqueueInitialSync(account.id);

    return account;
  }

  async updateAccount(
    userId: string,
    accountId: string,
    data: {
      displayName?: string;
      isPrimary?: boolean;
      syncEnabled?: boolean;
      autoSendCategories?: string[];
    },
  ): Promise<EmailAccountModel> {
    await this.getOwnedAccountOrThrow(userId, accountId);

    if (data.isPrimary) {
      await this.prisma.emailAccount.updateMany({
        where: { userId, id: { not: accountId } },
        data: { isPrimary: false },
      });
    }

    return this.prisma.emailAccount.update({
      where: { id: accountId },
      data,
    });
  }

  async disconnect(userId: string, accountId: string): Promise<void> {
    await this.getOwnedAccountOrThrow(userId, accountId);

    await this.prisma.$transaction([
      this.prisma.emailAccount.update({
        where: { id: accountId },
        data: { deletedAt: new Date(), syncEnabled: false },
      }),
      this.prisma.emailCredential.deleteMany({ where: { accountId } }),
    ]);
  }

  /** Decrypted, refreshed-if-needed access token for GOOGLE/MICROSOFT accounts. */
  async getValidAccessToken(accountId: string): Promise<string> {
    const account = await this.prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
      include: { credential: true },
    });

    if (account.provider === 'IMAP') {
      throw new BadRequestException(
        'IMAP accounts do not use OAuth access tokens',
      );
    }

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

    const refreshed = await this.refreshProviderToken(
      account.provider,
      refreshToken,
    );

    const encryptedAccessToken = this.encryptionService.encrypt(
      refreshed.accessToken,
    );

    await this.prisma.emailCredential.update({
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

  async getImapCredentials(
    accountId: string,
  ): Promise<{ config: ImapConfig; password: string }> {
    const account = await this.prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
      include: { credential: true },
    });

    if (account.provider !== 'IMAP' || !account.imapConfig) {
      throw new BadRequestException('This account is not an IMAP account');
    }

    if (!account.credential?.accessToken) {
      throw new NotFoundException('No credentials stored for this account');
    }

    return {
      config: account.imapConfig as unknown as ImapConfig,
      password: this.encryptionService.decrypt(account.credential.accessToken),
    };
  }

  async markSyncStarted(accountId: string): Promise<void> {
    await this.prisma.emailAccount.update({
      where: { id: accountId },
      data: { syncStatus: 'SYNCING', lastSyncError: null },
    });
  }

  async markSyncCompleted(accountId: string): Promise<void> {
    await this.prisma.emailAccount.update({
      where: { id: accountId },
      data: {
        syncStatus: 'IDLE',
        lastSyncedAt: new Date(),
        lastSyncError: null,
      },
    });
  }

  async markSyncFailed(accountId: string, error: string): Promise<void> {
    await this.prisma.emailAccount.update({
      where: { id: accountId },
      data: { syncStatus: 'ERROR', lastSyncError: error.slice(0, 2000) },
    });
  }

  private async verifyImapCredentials(config: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
  }): Promise<void> {
    const client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.username, pass: config.password },
      logger: false,
    });

    try {
      await client.connect();
    } catch (error) {
      this.logger.warn(
        `IMAP verification failed for ${config.username}: ${String(error)}`,
      );
      throw new BadRequestException(
        'Could not connect to the IMAP server with the provided credentials',
      );
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  private async refreshProviderToken(
    provider: 'GOOGLE' | 'MICROSOFT',
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: Date }> {
    const tokenUrl =
      provider === 'GOOGLE'
        ? 'https://oauth2.googleapis.com/token'
        : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

    const clientId = this.configService.getOrThrow<string>(
      provider === 'GOOGLE' ? 'GOOGLE_CLIENT_ID' : 'MICROSOFT_CLIENT_ID',
    );
    const clientSecret = this.configService.getOrThrow<string>(
      provider === 'GOOGLE'
        ? 'GOOGLE_CLIENT_SECRET'
        : 'MICROSOFT_CLIENT_SECRET',
    );

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new BadRequestException(
        `Failed to refresh ${provider} access token; reconnect this account`,
      );
    }

    const json = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_in
        ? new Date(Date.now() + json.expires_in * 1000)
        : undefined,
    };
  }
}
