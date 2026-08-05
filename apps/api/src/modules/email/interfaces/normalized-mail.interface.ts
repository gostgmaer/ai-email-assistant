import { MailFolderType } from '../../../generated/prisma/enums';
import { BulkMailSignals } from '../providers/bulk-mail.util';

export interface NormalizedParticipant {
  name?: string;
  address: string;
}

export interface NormalizedFolder {
  providerFolderId: string;
  name: string;
  type: MailFolderType;
}

export interface NormalizedMessage {
  providerMessageId: string;
  providerThreadId: string;
  subject?: string;
  from: NormalizedParticipant[];
  to: NormalizedParticipant[];
  cc?: NormalizedParticipant[];
  bcc?: NormalizedParticipant[];
  bodyText?: string;
  bodyHtml?: string;
  snippet?: string;
  receivedAt: Date;
  isRead: boolean;
  /** Raw bulk-mail signals (headers, sender pattern, subject shape),
   * computed independent of any per-account settings — providers don't
   * have account context. EmailSyncService combines this with the
   * account's filter settings (and thread-continuity) to decide whether
   * to actually exclude the message from sync. */
  bulkMailSignals: BulkMailSignals;
  /** Message-ID this is a reply to (In-Reply-To / envelope threading), if
   * any. A message with this set is always synced regardless of
   * isBulkMail — it's part of a real conversation. */
  inReplyTo?: string;
}

export interface ListMessagesOptions {
  limit?: number;
  pageToken?: string;
  /** Opaque provider cursor (Gmail historyId, Graph delta token, IMAP UID) for incremental sync. */
  sinceCursor?: string;
}

export interface ListMessagesResult {
  messages: NormalizedMessage[];
  nextPageToken?: string;
  /** Opaque provider cursor to persist for the next incremental sync. */
  cursor?: string;
}

export interface ComposeInput {
  to: NormalizedParticipant[];
  cc?: NormalizedParticipant[];
  bcc?: NormalizedParticipant[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  /** Set when replying: the provider message id being replied to. */
  inReplyToProviderMessageId?: string;
  /** Set when replying: the provider thread id to keep the reply in. */
  providerThreadId?: string;
}

export interface SendResult {
  providerMessageId: string;
  providerThreadId: string;
}

export interface MailProviderClient {
  listFolders(): Promise<NormalizedFolder[]>;
  listMessages(
    folderProviderId: string,
    options?: ListMessagesOptions,
  ): Promise<ListMessagesResult>;
  getMessage(
    providerMessageId: string,
    folderProviderId?: string,
  ): Promise<NormalizedMessage>;
  sendMessage(input: ComposeInput): Promise<SendResult>;
  markAsRead(
    providerMessageId: string,
    folderProviderId?: string,
  ): Promise<void>;
}
