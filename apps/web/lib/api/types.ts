export type EmailProvider = "GOOGLE" | "MICROSOFT" | "IMAP";
export type SyncStatus = "IDLE" | "SYNCING" | "ERROR";
export type MailFolderType =
  | "INBOX"
  | "SENT"
  | "DRAFTS"
  | "TRASH"
  | "SPAM"
  | "ARCHIVE"
  | "CUSTOM";

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  avatar: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailAccount {
  id: string;
  provider: EmailProvider;
  email: string;
  displayName: string | null;
  isPrimary: boolean;
  syncEnabled: boolean;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  autoSendCategories: string[];
  filterMarketing: boolean;
  filterOtp: boolean;
  filterPasswordReset: boolean;
  filterBilling: boolean;
  filterShipping: boolean;
  filterCalendar: boolean;
  createdAt: string;
}

export interface Participant {
  name?: string;
  address: string;
}

export interface GenerationMetadata {
  ragUsed: boolean;
  contactMemoryUsed: boolean;
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  documents: Array<{
    documentId: string;
    chunkId: string;
    filename: string;
    distance: number;
  }>;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  providerMessageId: string;
  from: Participant[];
  to: Participant[];
  cc: Participant[];
  bcc: Participant[];
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  receivedAt: string;
  isRead: boolean;
  createdAt: string;
  /** Set only on AI-generated replies (drafted or auto-sent) — null for
   * synced/manually-composed messages. */
  generationMetadata: GenerationMetadata | null;
}

export interface EmailThreadSummary {
  id: string;
  folderId: string;
  providerThreadId: string;
  subject: string | null;
  snippet: string | null;
  lastMessageAt: string | null;
  folder: {
    id: string;
    type: MailFolderType;
    name: string;
    accountId: string;
    account: { id: string; provider: EmailProvider; email: string };
  };
  messages: EmailMessage[];
  _count: { messages: number };
}

export interface EmailThreadDetail extends Omit<EmailThreadSummary, "messages"> {
  messages: EmailMessage[];
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ThreadsPage extends Pagination {
  threads: EmailThreadSummary[];
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsPage extends Pagination {
  notifications: Notification[];
}
