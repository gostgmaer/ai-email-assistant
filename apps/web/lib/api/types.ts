export type EmailProvider = "GOOGLE" | "MICROSOFT" | "IMAP";
export type SyncStatus = "IDLE" | "SYNCING" | "ERROR" | "AUTH_REQUIRED";
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

export type AccountRole = "OWNER" | "MEMBER";

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
  autoScheduleMeetings: boolean;
  filterMarketing: boolean;
  filterOtp: boolean;
  filterPasswordReset: boolean;
  filterBilling: boolean;
  filterShipping: boolean;
  filterCalendar: boolean;
  prohibitedPhrases: string[];
  createdAt: string;
  /** This user's Shared Inbox role on this account — OWNER can change
   * settings/disconnect/invite members, MEMBER can only work threads. */
  myRole: AccountRole;
}

export interface AccountMember {
  id: string;
  accountId: string;
  userId: string;
  role: AccountRole;
  invitedByUserId: string | null;
  createdAt: string;
  user: { id: string; email: string; displayName: string | null; avatar: string | null };
}

export interface ThreadNote {
  id: string;
  threadId: string;
  authorId: string;
  body: string;
  createdAt: string;
  author: { id: string; email: string; displayName: string | null };
}

export type WorkflowConditionField = "category" | "priority" | "sender";
export type WorkflowConditionOperator = "equals" | "contains";

export interface WorkflowCondition {
  field: WorkflowConditionField;
  operator: WorkflowConditionOperator;
  value: string;
}

export type WorkflowAction =
  | {
      type: "AUTO_REPLY";
      agentId?: string;
      calendarAgent?: boolean;
      /** Copy everyone else on the original message. */
      replyAll?: boolean;
      /** Let replies grounded in your documents auto-send to senders
       * you've never corresponded with (default: held for review). */
      allowUnknownSenderGrounding?: boolean;
    }
  | { type: "ASSIGN_TO"; userId: string }
  | { type: "NOTIFY"; userId: string; message?: string }
  | {
      type: "POST_TO_SLACK";
      integrationId: string;
      channelId: string;
      message?: string;
    }
  | {
      type: "POST_TO_TEAMS";
      integrationId: string;
      teamId: string;
      channelId: string;
      message?: string;
    }
  | { type: "CREATE_HUBSPOT_CONTACT"; integrationId: string }
  | { type: "REQUIRE_APPROVAL" }
  | {
      type: "REQUIRE_APPROVAL_CHAIN";
      approverUserIds: string[];
      /** Pending chains expire after this many hours (default 72). */
      expiresInHours?: number;
    };

export type WorkflowActionType = WorkflowAction["type"];

export interface WorkflowRule {
  id: string;
  accountId: string;
  name: string;
  enabled: boolean;
  order: number;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  accountId: string;
  name: string;
  systemPrompt: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  accountId: string;
  email: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  notes: string | null;
  tags: string[];
  status: string | null;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadAssignee {
  id: string;
  email: string;
  displayName: string | null;
}

export interface Participant {
  name?: string;
  address: string;
}

export interface GenerationMetadata {
  ragUsed: boolean;
  contactMemoryUsed: boolean;
  calendarAgentUsed: boolean;
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
  /** Output of the classify AI capability. Null until AI processing has
   * run for this message (see EmailMessage.aiProcessedAt). Loosely-typed
   * strings, not fixed enums — mirrors the AI service's own classify
   * response, which isn't constrained to a fixed value set. */
  category: string | null;
  priority: string | null;
  sentiment: string | null;
  isSpam: boolean;
  /** Set on a draft that answers a synced message (every AI-held reply). */
  inReplyToMessageId?: string | null;
  /** Set when the AI pipeline gave up on this message after its retries. */
  aiFailedAt?: string | null;
  aiError?: string | null;
}

/** An AI-generated reply held for review, as surfaced on the message it
 * answers (see InboxService.getThread). */
export interface PendingDraftReply {
  id: string;
  bodyText: string | null;
  createdAt: string;
  generationMetadata: GenerationMetadata | null;
  approvalChain: { status: "PENDING" | "APPROVED" | "REJECTED" } | null;
}

export interface ThreadDetailMessage extends EmailMessage {
  draftReplies: PendingDraftReply[];
}

export interface EmailThreadSummary {
  id: string;
  folderId: string;
  providerThreadId: string;
  subject: string | null;
  snippet: string | null;
  lastMessageAt: string | null;
  snoozedUntil: string | null;
  folder: {
    id: string;
    type: MailFolderType;
    name: string;
    accountId: string;
    account: { id: string; provider: EmailProvider; email: string };
  };
  messages: EmailMessage[];
  assignedTo: ThreadAssignee | null;
  _count: { messages: number };
}

// Deliberately NOT `Omit<EmailThreadSummary, "messages">` — InboxService.getThread
// (unlike listThreads) puts `account` at the top level and `folder` has no
// nested `account`, a genuinely different shape from the list response.
export interface EmailThreadDetail {
  id: string;
  folderId: string;
  providerThreadId: string;
  subject: string | null;
  snippet: string | null;
  lastMessageAt: string | null;
  snoozedUntil: string | null;
  account: { id: string; provider: EmailProvider; email: string; userId: string };
  folder: {
    id: string;
    type: MailFolderType;
    name: string;
    accountId: string;
    providerFolderId: string | null;
  };
  messages: ThreadDetailMessage[];
  assignedTo: ThreadAssignee | null;
  notes: ThreadNote[];
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

export type CalendarProvider = "GOOGLE" | "MICROSOFT";

export interface CalendarAccount {
  id: string;
  provider: CalendarProvider;
  email: string;
  displayName: string | null;
  isPrimary: boolean;
  createdAt: string;
}

export interface BusyInterval {
  start: string;
  end: string;
}

export type TaskType = "ACTION_ITEM" | "MEETING_REQUEST";
export type TaskStatus = "PENDING" | "DONE" | "DISMISSED";

export interface Task {
  id: string;
  userId: string;
  emailMessageId: string | null;
  threadId: string | null;
  type: TaskType;
  description: string;
  dueDate: string | null;
  status: TaskStatus;
  completedAt: string | null;
  calendarEventId: string | null;
  calendarEventUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export type IntegrationProvider = "SLACK" | "TEAMS" | "HUBSPOT";

export interface Integration {
  id: string;
  accountId: string;
  provider: IntegrationProvider;
  workspaceId: string | null;
  workspaceName: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationChannel {
  id: string;
  name: string;
}

export interface TeamsChannel {
  teamId: string;
  teamName: string;
  id: string;
  name: string;
}

export type ApprovalChainStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";
export type ApprovalStepStatus = "WAITING" | "PENDING" | "APPROVED" | "REJECTED";

export interface ApprovalStep {
  id: string;
  order: number;
  approverUserId: string;
  status: ApprovalStepStatus;
  comment: string | null;
  decidedAt: string | null;
  approver: { id: string; email: string; displayName: string | null };
}

export interface ApprovalChain {
  id: string;
  accountId: string;
  /** Null once the draft was sent or deleted — the chain itself is kept as
   * the audit record, with the snapshot fields below. */
  draftMessageId: string | null;
  status: ApprovalChainStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  draftSubject: string | null;
  draftRecipients: Participant[] | null;
  sentMessageId: string | null;
  steps: ApprovalStep[];
  draftMessage: {
    id: string;
    subject: string | null;
    bodyText: string | null;
    to: Participant[];
    threadId: string;
  } | null;
  account: { id: string; email: string };
}

export interface MeetingTimeSuggestion {
  start: string;
  end: string;
  title: string;
  calendarAccountId: string;
  suggestedAttendeeEmail?: string;
}
