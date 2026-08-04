import { MailFolderType } from '../../../generated/prisma/enums';

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
