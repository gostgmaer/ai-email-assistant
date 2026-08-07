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
import { refreshOAuthToken } from '../../oauth';
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

  /** Every account this user owns or has been granted Shared Inbox access
   * to (see AccountMember) — the owner always has their own membership
   * row (backfilled for pre-v2.0 accounts, created at connect-time for
   * new ones), so this single query covers both. `myRole` lets the
   * frontend gate owner-only actions (rename, filters, disconnect,
   * inviting members) without a second round trip per account. */
  async listForUser(
    userId: string,
  ): Promise<(EmailAccountModel & { myRole: 'OWNER' | 'MEMBER' })[]> {
    const accounts = await this.prisma.emailAccount.findMany({
      where: { deletedAt: null, members: { some: { userId } } },
      orderBy: { createdAt: 'asc' },
      include: { members: { where: { userId }, select: { role: true } } },
    });

    return accounts.map(({ members, ...account }) => ({
      ...account,
      // Always exactly one row — the where clause above guarantees a
      // membership match for every account returned.
      myRole: members[0].role,
    }));
  }

  /** Strict ownership — for account-level configuration (rename, filters,
   * auto-send/auto-schedule, primary flag) and destructive actions
   * (disconnect). Shared Inbox members can work threads on the account
   * (see getAccessibleAccountOrThrow) but not change its settings or
   * disconnect it. */
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

  /** Owner OR Shared Inbox member — for operational actions (view/reply/
   * send/draft/sync) that any account member should be able to do. */
  async getAccessibleAccountOrThrow(
    userId: string,
    accountId: string,
  ): Promise<EmailAccountModel> {
    const account = await this.prisma.emailAccount.findUnique({
      where: { id: accountId },
    });

    if (!account || account.deletedAt) {
      throw new NotFoundException('Email account not found');
    }

    const membership = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId, userId } },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this account');
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

    await this.ensureOwnerMembership(account.id, userId);
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

    await this.ensureOwnerMembership(account.id, userId);
    await this.queueService.enqueueInitialSync(account.id);

    return account;
  }

  /** Idempotent — matches the emailCredential.upsert pattern above rather
   * than a nested write, so reconnecting an already-owned account never
   * throws on the AccountMember unique constraint. */
  private async ensureOwnerMembership(
    accountId: string,
    userId: string,
  ): Promise<void> {
    await this.prisma.accountMember.upsert({
      where: { accountId_userId: { accountId, userId } },
      create: { accountId, userId, role: 'OWNER' },
      update: {},
    });
  }

  async updateAccount(
    userId: string,
    accountId: string,
    data: {
      displayName?: string;
      isPrimary?: boolean;
      syncEnabled?: boolean;
      autoSendCategories?: string[];
      autoScheduleMeetings?: boolean;
      filterMarketing?: boolean;
      filterOtp?: boolean;
      filterPasswordReset?: boolean;
      filterBilling?: boolean;
      filterShipping?: boolean;
      filterCalendar?: boolean;
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

  /** Any member can see who else has access — matches how shared mailboxes
   * work elsewhere (Front, Help Scout): visibility into the team isn't a
   * privileged action, only inviting/removing people is. */
  async listMembers(userId: string, accountId: string) {
    await this.getAccessibleAccountOrThrow(userId, accountId);

    return this.prisma.accountMember.findMany({
      where: { accountId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, avatar: true },
        },
      },
    });
  }

  /**
   * Grants an existing registered user access to this account. Deliberately
   * simple for v2.0: no invite-by-email-to-a-non-user flow with a signup
   * token (that's the kind of thing full multi-tenancy in v3.0 would want
   * to do properly) — the invitee must already have an account here.
   */
  async inviteMember(
    ownerUserId: string,
    accountId: string,
    inviteeEmail: string,
  ) {
    await this.getOwnedAccountOrThrow(ownerUserId, accountId);

    const invitee = await this.prisma.user.findUnique({
      where: { email: inviteeEmail },
    });

    if (!invitee) {
      throw new NotFoundException(
        'No user with that email has an account here yet',
      );
    }

    return this.prisma.accountMember.upsert({
      where: { accountId_userId: { accountId, userId: invitee.id } },
      create: {
        accountId,
        userId: invitee.id,
        role: 'MEMBER',
        invitedByUserId: ownerUserId,
      },
      // Already a member (including the owner themselves) — no-op rather
      // than an error, so re-inviting isn't a footgun.
      update: {},
      include: {
        user: {
          select: { id: true, email: true, displayName: true, avatar: true },
        },
      },
    });
  }

  async removeMember(
    ownerUserId: string,
    accountId: string,
    targetUserId: string,
  ): Promise<void> {
    const account = await this.getOwnedAccountOrThrow(ownerUserId, accountId);

    if (targetUserId === account.userId) {
      throw new ForbiddenException(
        'The account owner cannot be removed — disconnect the account instead',
      );
    }

    await this.prisma.accountMember.deleteMany({
      where: { accountId, userId: targetUserId },
    });
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

    const refreshed = await refreshOAuthToken(
      account.provider,
      refreshToken,
      this.configService,
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
}
