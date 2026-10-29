import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError } from 'bullmq';

import { PrismaService } from '../../../database';
import {
  EmailAccountModel,
  MailFolderModel,
} from '../../../generated/prisma/models';
import type { InputJsonValue } from '../../../generated/prisma/internal/prismaNamespace';
import { QueueService } from '../../../infrastructure/queue';
import { EmailAccountService } from '../../email-account';
import { bulkKindOf, MailFilterSettings } from '../providers/bulk-mail.util';
import { OAuthReconnectRequiredException } from '../../oauth';
import {
  FolderChangeSet,
  MailProviderClient,
  NormalizedMessage,
} from '../interfaces';
import {
  MailAuthError,
  MailRateLimitError,
  SyncCursorExpiredError,
} from '../providers/mail-errors';
import { MailProviderFactory } from '../providers/mail-provider.factory';
import { ThreadTriageService } from './thread-triage.service';

// Backoff for a failing account: 5 min, 10, 20, ... capped at 6 h.
const SYNC_BACKOFF_BASE_MS = 5 * 60 * 1000;
const SYNC_BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;
// Tell the user once, when an account has failed this many syncs in a row
// (not on every failure — that was hundreds of notifications a day).
const SYNC_FAILURE_NOTIFY_THRESHOLD = 3;
const ALIAS_REFRESH_MS = 24 * 60 * 60 * 1000;
const MAX_LIST_PAGE_SIZE = 100;
const AI_ENQUEUE_DELAY_MS = 30 * 1000;
// Sent mail older than this isn't read for commitments — the same window
// as CommitmentService's COMMITMENT_MAX_AGE_DAYS.
const COMMITMENT_SCAN_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

@Injectable()
export class EmailSyncService {
  private readonly logger = new Logger(EmailSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailAccountService: EmailAccountService,
    private readonly mailProviderFactory: MailProviderFactory,
    private readonly queueService: QueueService,
    private readonly configService: ConfigService,
    private readonly threadTriageService: ThreadTriageService,
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
      const syncedAccount = await this.refreshAliases(account, client);
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

      // One folder failing (deleted remotely, a provider hiccup on one
      // label) mustn't stop the others from syncing. Credential and
      // rate-limit failures are account-wide, so those abort immediately;
      // and if EVERY folder failed, the account sync as a whole failed.
      const problems: string[] = [];
      let firstFolderError: unknown;
      let failedFolders = 0;

      for (const folder of orderedFolders) {
        try {
          const skipped = await this.syncFolderMessages(
            folder,
            client,
            mode,
            syncedAccount,
          );
          if (skipped > 0) {
            problems.push(`${skipped} message(s) in ${folder.name}`);
          }
        } catch (error) {
          if (isAccountWideFailure(error)) {
            throw error;
          }
          failedFolders++;
          firstFolderError ??= error;
          problems.push(`folder ${folder.name}`);
          this.logger.warn(
            `Sync of folder ${folder.name} failed for account ${accountId}: ${errorMessage(error)}`,
          );
        }
      }

      if (
        orderedFolders.length > 0 &&
        failedFolders === orderedFolders.length
      ) {
        throw firstFolderError;
      }

      await this.emailAccountService.markSyncCompleted(
        accountId,
        problems.length > 0
          ? `Synced with problems — couldn't sync ${problems.join(', ')}. Will retry on the next sync.`
          : undefined,
      );

      if (mode === 'full') {
        await this.queueService.enqueueNotification(
          account.userId,
          'Mailbox connected',
          `${account.email} finished its first sync and is ready to use.`,
          { accountId },
        );
      }
    } catch (error) {
      await this.recordSyncFailure(account, error);

      // A credential failure can't be fixed by BullMQ retrying the job —
      // stop here; the account waits in AUTH_REQUIRED for a reconnect.
      if (isAuthFailure(error)) {
        throw new UnrecoverableError(errorMessage(error));
      }
      throw error;
    }
  }

  /**
   * Records a failed sync and decides what happens next, so a broken
   * account degrades quietly instead of failing (and notifying) every
   * five minutes forever:
   * - credential failures → AUTH_REQUIRED: background sync stops for the
   *   account until it's reconnected; the user is told once.
   * - anything else → ERROR with exponential backoff (nextSyncAt, which
   *   the background scan respects), honouring a provider's Retry-After;
   *   the user is told once, when failures first reach the threshold.
   */
  private async recordSyncFailure(
    account: EmailAccountModel,
    error: unknown,
  ): Promise<void> {
    const message = errorMessage(error);
    const authFailure = isAuthFailure(error);
    const failures = account.consecutiveSyncFailures + 1;

    const backoffMs = Math.min(
      SYNC_BACKOFF_BASE_MS * 2 ** (failures - 1),
      SYNC_BACKOFF_MAX_MS,
    );
    const retryAfterMs =
      error instanceof MailRateLimitError ? (error.retryAfterMs ?? 0) : 0;

    this.logger.warn(
      `Sync failed for account ${account.id} (failure #${failures}${authFailure ? ', reconnect required' : ''}): ${message}`,
    );

    await this.emailAccountService.markSyncFailed(account.id, message, {
      status: authFailure ? 'AUTH_REQUIRED' : 'ERROR',
      consecutiveFailures: failures,
      nextSyncAt: authFailure
        ? null
        : new Date(Date.now() + Math.max(backoffMs, retryAfterMs)),
    });

    if (authFailure && account.syncStatus !== 'AUTH_REQUIRED') {
      await this.queueService.enqueueNotification(
        account.userId,
        'Reconnect your mailbox',
        `${account.email} stopped syncing because its sign-in is no longer valid. Reconnect it in Settings to resume.`,
        { accountId: account.id },
        'SYNC_FAILED',
      );
    } else if (!authFailure && failures === SYNC_FAILURE_NOTIFY_THRESHOLD) {
      await this.queueService.enqueueNotification(
        account.userId,
        'Sync failing',
        `We couldn't sync ${account.email} ${failures} times in a row and will keep retrying less often: ${message}`,
        { accountId: account.id },
        'SYNC_FAILED',
      );
    }
  }

  /** Keeps the account's send-as aliases current (at most daily) so mail
   * the user sent from an alias isn't mistaken for inbound mail.
   * Best-effort: a failure here never fails the sync. */
  private async refreshAliases(
    account: EmailAccountModel,
    client: MailProviderClient,
  ): Promise<EmailAccountModel> {
    const isFresh =
      account.aliasesRefreshedAt &&
      Date.now() - account.aliasesRefreshedAt.getTime() < ALIAS_REFRESH_MS;

    if (!client.listAliases || isFresh) {
      return account;
    }

    try {
      const aliases = [
        ...new Set(
          (await client.listAliases()).filter(
            (alias) => alias !== account.email.toLowerCase(),
          ),
        ),
      ];
      return await this.prisma.emailAccount.update({
        where: { id: account.id },
        data: {
          aliases,
          aliasesRefreshedAt: new Date(),
          signatureHtml: await this.importSignature(account, client),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Couldn't refresh aliases for account ${account.id}: ${errorMessage(error)}`,
      );
      return account;
    }
  }

  /** The provider's signature (Gmail sendAs), for an account that has
   * never had one set here — null signature fields mean "never set"; an
   * empty string is the user choosing none, and is left alone. Returns
   * undefined (no change) otherwise or on failure. */
  private async importSignature(
    account: EmailAccountModel,
    client: MailProviderClient,
  ): Promise<string | undefined> {
    if (
      !client.getSignature ||
      account.signatureHtml !== null ||
      account.signatureText !== null
    ) {
      return undefined;
    }

    try {
      return (await client.getSignature()) ?? undefined;
    } catch (error) {
      this.logger.warn(
        `Couldn't import the signature for account ${account.id}: ${errorMessage(error)}`,
      );
      return undefined;
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

  /**
   * Syncs one folder. Returns how many messages were skipped because they
   * failed individually (see persistIsolated).
   *
   * Providers with change tracking (Gmail history, Graph delta) sync from
   * a stored cursor, so every change since the last sync is seen — not
   * just the newest N messages, which silently lost anything past N on a
   * busy mailbox. Without a usable cursor (first sync, expired cursor,
   * accounts synced before cursors existed) the folder is re-baselined: a
   * cursor for "now" is taken FIRST, then the newest messages are listed,
   * so nothing arriving in between falls into a gap. IMAP keeps its
   * UID-based listMessages(sinceCursor) path.
   */
  private async syncFolderMessages(
    folder: MailFolderModel,
    client: MailProviderClient,
    mode: 'full' | 'incremental',
    account: EmailAccountModel,
  ): Promise<number> {
    const folderProviderId = folder.providerFolderId;
    if (!folderProviderId) {
      return 0;
    }

    if (!client.listChanges || !client.getChangeCursor) {
      return this.syncFolderByListing(folder, client, mode, account);
    }

    if (mode === 'incremental' && folder.syncCursor) {
      try {
        const changes = await client.listChanges(
          folderProviderId,
          folder.syncCursor,
        );
        const skipped = await this.applyChanges(
          folder,
          changes,
          client,
          account,
        );
        await this.saveCursor(folder, changes.nextCursor);
        return skipped;
      } catch (error) {
        if (!(error instanceof SyncCursorExpiredError)) {
          throw error;
        }
        this.logger.warn(
          `Sync cursor for folder ${folder.name} (account ${account.id}) expired, re-baselining: ${error.message}`,
        );
      }
    }

    const cursor = await client.getChangeCursor(folderProviderId);
    const { messages } = await this.listNewest(client, folderProviderId);
    const skipped = await this.persistIsolated(messages, (message) =>
      this.persistMessage(folder, message, account, mode),
    );
    await this.saveCursor(folder, cursor);
    return skipped;
  }

  private async syncFolderByListing(
    folder: MailFolderModel,
    client: MailProviderClient,
    mode: 'full' | 'incremental',
    account: EmailAccountModel,
  ): Promise<number> {
    const folderProviderId = folder.providerFolderId;

    const result =
      mode === 'incremental' && folder.syncCursor
        ? await client.listMessages(folderProviderId, {
            sinceCursor: folder.syncCursor,
            limit: 200,
          })
        : await this.listNewest(client, folderProviderId);

    const skipped = await this.persistIsolated(result.messages, (message) =>
      this.persistMessage(folder, message, account, mode),
    );

    if (result.cursor) {
      await this.saveCursor(folder, result.cursor);
    }
    return skipped;
  }

  /** The newest INITIAL_SYNC_LIMIT messages of a folder, paging as needed.
   * The cursor is the FIRST page's: later pages reach further back. */
  private async listNewest(
    client: MailProviderClient,
    folderProviderId: string,
  ): Promise<{ messages: NormalizedMessage[]; cursor?: string }> {
    const limit = Math.max(
      1,
      Number(this.configService.get<string>('INITIAL_SYNC_LIMIT') ?? 50) || 50,
    );
    const messages: NormalizedMessage[] = [];
    let cursor: string | undefined;
    let pageToken: string | undefined;

    do {
      const page = await client.listMessages(folderProviderId, {
        limit: Math.min(limit - messages.length, MAX_LIST_PAGE_SIZE),
        pageToken,
      });
      cursor ??= page.cursor;
      messages.push(...page.messages);
      pageToken = page.nextPageToken;
    } while (pageToken && messages.length < limit);

    return { messages, cursor };
  }

  private async applyChanges(
    folder: MailFolderModel,
    changes: FolderChangeSet,
    client: MailProviderClient,
    account: EmailAccountModel,
  ): Promise<number> {
    let skipped = await this.persistIsolated(changes.removed, (id) =>
      this.removeLocalMessage(account.id, id),
    );

    skipped += await this.persistIsolated(
      changes.upserted,
      async ({ providerMessageId, isRead }) => {
        const existing = await this.prisma.emailMessage.findFirst({
          where: { providerMessageId, thread: { accountId: account.id } },
          select: { id: true, isRead: true },
        });

        if (existing) {
          if (isRead !== undefined && isRead !== existing.isRead) {
            await this.prisma.emailMessage.update({
              where: { id: existing.id },
              data: { isRead },
            });
          }
          return;
        }

        const message = await client.getMessage(
          providerMessageId,
          folder.providerFolderId ?? undefined,
        );
        await this.persistMessage(folder, message, account, 'incremental');
      },
    );

    return skipped;
  }

  /** Mirrors a provider-side permanent delete. A thread left with no
   * messages goes too, so it doesn't linger as an empty inbox row. */
  private async removeLocalMessage(
    accountId: string,
    providerMessageId: string,
  ): Promise<void> {
    const rows = await this.prisma.emailMessage.findMany({
      where: { providerMessageId, thread: { accountId } },
      select: { id: true, threadId: true },
    });

    for (const row of rows) {
      await this.prisma.emailMessage.delete({ where: { id: row.id } });
      const remaining = await this.prisma.emailMessage.count({
        where: { threadId: row.threadId },
      });
      if (remaining === 0) {
        await this.prisma.emailThread.delete({ where: { id: row.threadId } });
      }
    }
  }

  /**
   * Runs `fn` per item, isolating failures: one malformed or vanished
   * message is logged and skipped instead of aborting the whole folder
   * (which previously blocked the cursor and failed the same way on every
   * sync, forever). Account-wide failures still propagate. Returns the
   * number of items skipped.
   */
  private async persistIsolated<T>(
    items: T[],
    fn: (item: T) => Promise<void>,
  ): Promise<number> {
    let skipped = 0;

    for (const item of items) {
      try {
        await fn(item);
      } catch (error) {
        if (isAccountWideFailure(error)) {
          throw error;
        }
        skipped++;
        this.logger.warn(
          `Skipped one message during sync: ${errorMessage(error)}`,
        );
      }
    }

    return skipped;
  }

  private async saveCursor(
    folder: MailFolderModel,
    cursor: string,
  ): Promise<void> {
    if (cursor === folder.syncCursor) {
      return;
    }

    await this.prisma.mailFolder.update({
      where: { id: folder.id },
      data: { syncCursor: cursor },
    });
  }

  private async persistMessage(
    folder: MailFolderModel,
    message: NormalizedMessage,
    account: EmailAccountModel,
    mode: 'full' | 'incremental',
  ): Promise<void> {
    const accountId = account.id;
    const folderId = folder.id;

    // The user's own addresses: the account's primary address plus its
    // send-as aliases — mail sent from an alias is still the user's own.
    const ownAddresses = new Set([
      account.email.toLowerCase(),
      ...account.aliases,
    ]);
    const isInbound = !message.from.some((sender) =>
      ownAddresses.has(sender.address.toLowerCase()),
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

    // Smart triage: an account that keeps newsletters stores them (in the
    // Newsletters group) instead of dropping them — but they're still bulk
    // mail, so they never enter the AI pipeline below. That holds even on
    // an existing thread: the thread may be nothing but earlier issues.
    const bulkKind = isInbound
      ? bulkKindOf(message.bulkMailSignals, filterSettings)
      : null;
    const keptAsNewsletter =
      bulkKind === 'NEWSLETTER' && account.keepNewsletters;

    if (bulkKind && !keptAsNewsletter) {
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
      update: {},
    });

    // The thread's subject/snippet/lastMessageAt describe its NEWEST
    // message. Providers list newest-first, so writing them
    // unconditionally let the oldest message processed in a batch win —
    // corrupting inbox order, follow-ups and the digest. Only a message
    // newer than what's stored may update them; the conditional update is
    // atomic, so concurrent syncs can't regress it either.
    await this.prisma.emailThread.updateMany({
      where: {
        id: thread.id,
        OR: [
          { lastMessageAt: null },
          { lastMessageAt: { lt: message.receivedAt } },
        ],
      },
      data: {
        subject: message.subject,
        snippet: message.snippet,
        lastMessageAt: message.receivedAt,
        lastMessageFromSelf: !isInbound,
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
        bulkKind,
        listUnsubscribe: message.listUnsubscribe?.slice(0, 2000),
        listUnsubscribePost: message.listUnsubscribePost?.slice(0, 200),
        // The user's own recent mail (sent from another client, or the
        // provider's copy of app-sent mail) is read for commitments.
        commitmentScanPending:
          !isInbound &&
          folder.type !== 'DRAFTS' &&
          Date.now() - message.receivedAt.getTime() <
            COMMITMENT_SCAN_MAX_AGE_MS,
        replyTo: message.replyTo?.length
          ? (message.replyTo as unknown as InputJsonValue)
          : undefined,
        messageIdHeader: message.messageIdHeader,
        references: message.references ?? [],
        attachments: message.attachments?.length
          ? {
              create: message.attachments.map((attachment) => ({
                filename: attachment.filename.slice(0, 255),
                mimeType: attachment.mimeType,
                size: attachment.size,
                providerAttachmentId: attachment.providerAttachmentId,
                contentId: attachment.contentId,
                isInline: attachment.isInline,
              })),
            }
          : undefined,
      },
      update: {
        isRead: message.isRead,
      },
    });

    // Only run the AI pipeline for genuinely new, inbound messages — never
    // for updates (re-syncs) or the SENT-folder copy of our own outbound
    // mail. Bulk mail is already filtered out above, before it's ever
    // persisted — or, for a kept newsletter, excluded here.
    if (!existing) {
      await this.threadTriageService.refreshQuietly(thread.id);
    }

    if (
      !existing &&
      isInbound &&
      !keptAsNewsletter &&
      this.isEligibleForAi(folder, message, account, mode)
    ) {
      // Delayed briefly so a burst of messages on one thread (a sync
      // that picks up several at once) is all persisted before any of
      // them is processed — the AI pipeline then answers only the newest
      // (see AiProcessingProcessor.findSupersededReason).
      await this.queueService.enqueueAiProcessing(saved.id, {
        delayMs: AI_ENQUEUE_DELAY_MS,
      });
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : JSON.stringify(error);
}

/** The stored credentials are no longer accepted; only a reconnect helps. */
function isAuthFailure(error: unknown): boolean {
  return (
    error instanceof MailAuthError ||
    error instanceof OAuthReconnectRequiredException
  );
}

/** Failures that affect every folder/message of the account alike, so
 * per-folder and per-message isolation must not swallow them. */
function isAccountWideFailure(error: unknown): boolean {
  return isAuthFailure(error) || error instanceof MailRateLimitError;
}
