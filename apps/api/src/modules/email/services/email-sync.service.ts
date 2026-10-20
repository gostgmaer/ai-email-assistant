import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../database';
import {
  EmailAccountModel,
  MailFolderModel,
} from '../../../generated/prisma/models';
import type { InputJsonValue } from '../../../generated/prisma/internal/prismaNamespace';
import { QueueService } from '../../../infrastructure/queue';
import { EmailAccountService } from '../../email-account';
import { isBulkMail, MailFilterSettings } from '../providers/bulk-mail.util';
import {
  ListMessagesOptions,
  MailProviderClient,
  NormalizedMessage,
} from '../interfaces';
import { MailProviderFactory } from '../providers/mail-provider.factory';

@Injectable()
export class EmailSyncService {
  private readonly logger = new Logger(EmailSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailAccountService: EmailAccountService,
    private readonly mailProviderFactory: MailProviderFactory,
    private readonly queueService: QueueService,
    private readonly configService: ConfigService,
  ) {}

  async syncAccount(
    accountId: string,
    mode: 'full' | 'incremental',
  ): Promise<void> {
    const account = await this.prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
    });

    if (!account.syncEnabled || account.deletedAt) {
      return;
    }

    await this.emailAccountService.markSyncStarted(accountId);

    try {
      const client = await this.mailProviderFactory.createClient(account);
      const folders = await this.syncFolders(accountId, client);

      // A thread's folderId is only set when the thread row is first
      // created (see persistMessage); syncing INBOX/SENT first ensures
      // new threads anchor to a meaningful folder instead of whichever
      // label the provider happened to list first.
      const folderPriority: Partial<Record<MailFolderModel['type'], number>> = {
        INBOX: 0,
        SENT: 1,
      };
      const orderedFolders = [...folders].sort(
        (a, b) =>
          (folderPriority[a.type] ?? 99) - (folderPriority[b.type] ?? 99),
      );

      for (const folder of orderedFolders) {
        await this.syncFolderMessages(folder, client, mode, account);
      }

      await this.emailAccountService.markSyncCompleted(accountId);

      if (mode === 'full') {
        await this.queueService.enqueueNotification(
          account.userId,
          'Mailbox connected',
          `${account.email} finished its first sync and is ready to use.`,
          { accountId },
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Sync failed for account ${accountId}: ${message}`);
      await this.emailAccountService.markSyncFailed(accountId, message);
      await this.queueService.enqueueNotification(
        account.userId,
        'Sync failed',
        `We couldn't sync ${account.email}: ${message}`,
        { accountId },
      );
      throw error;
    }
  }

  async syncFoldersOnly(accountId: string): Promise<void> {
    const account = await this.prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
    });

    const client = await this.mailProviderFactory.createClient(account);
    await this.syncFolders(accountId, client);
  }

  private async syncFolders(
    accountId: string,
    client: MailProviderClient,
  ): Promise<MailFolderModel[]> {
    const remoteFolders = await client.listFolders();
    const folders: MailFolderModel[] = [];

    for (const remote of remoteFolders) {
      const folder = await this.prisma.mailFolder.upsert({
        where: {
          accountId_providerFolderId: {
            accountId,
            providerFolderId: remote.providerFolderId,
          },
        },
        create: {
          accountId,
          providerFolderId: remote.providerFolderId,
          name: remote.name,
          type: remote.type,
        },
        update: { name: remote.name, type: remote.type },
      });

      folders.push(folder);
    }

    return folders;
  }

  private async syncFolderMessages(
    folder: MailFolderModel,
    client: MailProviderClient,
    mode: 'full' | 'incremental',
    account: EmailAccountModel,
  ): Promise<void> {
    if (!folder.providerFolderId) {
      return;
    }

    const options: ListMessagesOptions =
      mode === 'incremental' && folder.syncCursor
        ? { sinceCursor: folder.syncCursor, limit: 200 }
        : { limit: 50 };

    const result = await client.listMessages(folder.providerFolderId, options);

    for (const message of result.messages) {
      await this.persistMessage(folder, message, account, mode);
    }

    if (result.cursor && result.cursor !== folder.syncCursor) {
      await this.prisma.mailFolder.update({
        where: { id: folder.id },
        data: { syncCursor: result.cursor },
      });
    }
  }

  private async persistMessage(
    folder: MailFolderModel,
    message: NormalizedMessage,
    account: EmailAccountModel,
    mode: 'full' | 'incremental',
  ): Promise<void> {
    const accountId = account.id;
    const folderId = folder.id;

    const isInbound = !message.from.some(
      (sender) => sender.address.toLowerCase() === account.email.toLowerCase(),
    );

    // Newsletters/notifications/automated mail (detected from bulk-sender
    // headers, sender-address patterns, or subject shape — filtered
    // per-category according to the account's own filter* settings) never
    // enter the app at all — no thread, no message, nothing to show in
    // the inbox. Only applies to inbound mail; never skip the user's own
    // sent/draft copies. Exception: a message that's part of a real
    // conversation (explicit In-Reply-To, or the thread already has other
    // messages) is always synced regardless — a bulk-looking auto-reply
    // inside a thread you're actually having is still part of that
    // conversation.
    const filterSettings: MailFilterSettings = {
      filterMarketing: account.filterMarketing,
      filterOtp: account.filterOtp,
      filterPasswordReset: account.filterPasswordReset,
      filterBilling: account.filterBilling,
      filterShipping: account.filterShipping,
      filterCalendar: account.filterCalendar,
    };

    if (isInbound && isBulkMail(message.bulkMailSignals, filterSettings)) {
      const isPartOfConversation =
        !!message.inReplyTo ||
        (await this.prisma.emailThread.findFirst({
          where: { accountId, providerThreadId: message.providerThreadId },
          select: { id: true },
        })) !== null;

      if (!isPartOfConversation) {
        return;
      }
    }

    const thread = await this.prisma.emailThread.upsert({
      where: {
        accountId_providerThreadId: {
          accountId,
          providerThreadId: message.providerThreadId,
        },
      },
      create: {
        accountId,
        folderId,
        providerThreadId: message.providerThreadId,
        subject: message.subject,
        snippet: message.snippet,
        lastMessageAt: message.receivedAt,
      },
      update: {
        subject: message.subject,
        snippet: message.snippet,
        lastMessageAt: message.receivedAt,
      },
    });

    const existing = await this.prisma.emailMessage.findUnique({
      where: {
        threadId_providerMessageId: {
          threadId: thread.id,
          providerMessageId: message.providerMessageId,
        },
      },
      select: { id: true },
    });

    const saved = await this.prisma.emailMessage.upsert({
      where: {
        threadId_providerMessageId: {
          threadId: thread.id,
          providerMessageId: message.providerMessageId,
        },
      },
      create: {
        threadId: thread.id,
        providerMessageId: message.providerMessageId,
        from: message.from as unknown as InputJsonValue,
        to: message.to as unknown as InputJsonValue,
        cc: message.cc as unknown as InputJsonValue,
        bcc: message.bcc as unknown as InputJsonValue,
        subject: message.subject,
        bodyText: message.bodyText,
        bodyHtml: message.bodyHtml,
        receivedAt: message.receivedAt,
        isRead: message.isRead,
        isAutoReply: message.bulkMailSignals.autoReply,
      },
      update: {
        isRead: message.isRead,
      },
    });

    // Only run the AI pipeline for genuinely new, inbound messages — never
    // for updates (re-syncs) or the SENT-folder copy of our own outbound
    // mail. Bulk mail is already filtered out above, before it's ever
    // persisted.
    if (
      !existing &&
      isInbound &&
      this.isEligibleForAi(folder, message, account, mode)
    ) {
      await this.queueService.enqueueAiProcessing(saved.id);
    }
  }

  /**
   * Whether a newly synced inbound message may enter the AI pipeline (and
   * so potentially get an autonomous reply). Persisting the message is
   * unaffected — this only gates the AI job. Excluded:
   * - anything from a full (initial) sync: that's importing history, and
   *   connecting a mailbox must never fire replies into old threads;
   * - folders that aren't real incoming mail (SPAM, TRASH, SENT, DRAFTS);
   * - mail received before the account's aiEnabledFrom, or older than
   *   AI_MAX_MESSAGE_AGE_HOURS — an incremental sync can still surface old
   *   messages (a newly listed folder, a provider re-delivering a page).
   */
  private isEligibleForAi(
    folder: MailFolderModel,
    message: NormalizedMessage,
    account: EmailAccountModel,
    mode: 'full' | 'incremental',
  ): boolean {
    if (mode === 'full') {
      return false;
    }

    if (folder.type !== 'INBOX' && folder.type !== 'CUSTOM') {
      return false;
    }

    if (message.receivedAt < account.aiEnabledFrom) {
      return false;
    }

    const maxAgeHours = Number(
      this.configService.get<string>('AI_MAX_MESSAGE_AGE_HOURS') ?? 48,
    );
    const oldestAllowed = Date.now() - maxAgeHours * 60 * 60 * 1000;

    return message.receivedAt.getTime() >= oldestAllowed;
  }
}
