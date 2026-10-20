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
  /** Reply-To header — where replies should go when set. */
  replyTo?: NormalizedParticipant[];
  /** RFC 5322 Message-ID (angle brackets included). */
  messageIdHeader?: string;
  /** RFC 5322 References, oldest first. */
  references?: string[];
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
  /** Set when replying: the parent's RFC Message-ID / References chain,
   * written as In-Reply-To / References so other clients thread it. */
  inReplyToHeader?: string;
  referencesHeader?: string[];
  /** Extra RFC 5322 headers, e.g. Auto-Submitted on autonomous replies.
   * Microsoft Graph only accepts custom headers named X-*, so other names
   * are dropped there (see MicrosoftGraphClient.sendMessage). */
  headers?: Record<string, string>;
}

export interface SendResult {
  providerMessageId: string;
  providerThreadId: string;
}

/** What changed in a folder since a change cursor (see listChanges). */
export interface FolderChangeSet {
  /** Messages new to the folder or whose read state changed — bare ids;
   * EmailSyncService fetches the full message only for ids it doesn't
   * already have. isRead is set when the provider reported it. */
  upserted: { providerMessageId: string; isRead?: boolean }[];
  /** Messages permanently deleted at the provider. */
  removed: string[];
  /** Cursor to store for the next call. */
  nextCursor: string;
}

export interface MailProviderClient {
  /**
   * Change tracking (Gmail history, Graph delta). Optional — a provider
   * without it (IMAP) is synced by listMessages + sinceCursor instead.
   * getChangeCursor returns a cursor for "now"; it's taken BEFORE a
   * baseline listing so nothing arriving during the listing is missed.
   * listChanges throws SyncCursorExpiredError when the cursor is too old.
   */
  getChangeCursor?(folderProviderId: string): Promise<string>;
  listChanges?(
    folderProviderId: string,
    cursor: string,
  ): Promise<FolderChangeSet>;
  /** The mailbox's other send-as addresses, lowercased. Optional. */
  listAliases?(): Promise<string[]>;
  /** The default send-as signature (HTML), if the provider exposes one
   * (Gmail). Null when none is set. Optional. */
  getSignature?(): Promise<string | null>;

  /** Rule actions (ADD_LABEL / MOVE_TO_FOLDER / ARCHIVE). Optional — a
   * provider without one makes that action fail for its accounts. label is
   * a display name (Gmail label, Outlook category, IMAP keyword).
   * moveMessage/archiveMessage resolve to the message's NEW provider id when
   * moving re-keys it (Microsoft Graph), so the stored row can follow —
   * replies are created from that id. Undefined when the id is stable. */
  addLabel?(
    providerMessageId: string,
    label: string,
    folderProviderId?: string,
  ): Promise<void>;
  moveMessage?(
    providerMessageId: string,
    destinationFolderProviderId: string,
    sourceFolderProviderId?: string,
  ): Promise<string | undefined>;
  archiveMessage?(
    providerMessageId: string,
    folderProviderId?: string,
  ): Promise<string | undefined>;

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
