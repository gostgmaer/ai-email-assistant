import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../database';
import {
  EmailAccountModel,
  MailFolderModel,
} from '../../../generated/prisma/models';
import type { InputJsonValue } from '../../../generated/prisma/internal/prismaNamespace';
import { QueueService } from '../../../infrastructure/queue';
import { EmailAccountService } from '../../email-account';
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
      await this.persistMessage(folder.id, message, account);
    }

    if (result.cursor && result.cursor !== folder.syncCursor) {
      await this.prisma.mailFolder.update({
        where: { id: folder.id },
        data: { syncCursor: result.cursor },
      });
    }
  }

  private async persistMessage(
    folderId: string,
    message: NormalizedMessage,
    account: EmailAccountModel,
  ): Promise<void> {
    const accountId = account.id;

    const isInbound = !message.from.some(
      (sender) => sender.address.toLowerCase() === account.email.toLowerCase(),
    );

    // Newsletters/notifications/automated mail (detected from
    // List-Unsubscribe/List-Id/Precedence/Auto-Submitted headers, or a
    // noreply-style sender) never enter the app at all — no thread, no
    // message, nothing to show in the inbox. Only applies to inbound mail;
    // never skip the user's own sent/draft copies.
    if (isInbound && message.isBulkMail) {
      return;
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
      },
      update: {
        isRead: message.isRead,
      },
    });

    // Only run the AI pipeline for genuinely new, inbound messages — never
    // for updates (re-syncs) or the SENT-folder copy of our own outbound
    // mail. Bulk mail is already filtered out above, before it's ever
    // persisted.
    if (!existing && isInbound) {
      await this.queueService.enqueueAiProcessing(saved.id);
    }
  }
}
