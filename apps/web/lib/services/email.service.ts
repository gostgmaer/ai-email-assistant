import { apiFetch, apiFetchBlob } from "../api/client";
import type {
  AttachmentInput,
  EmailMessage,
  EmailThreadDetail,
  MailFolderSummary,
  ThreadNote,
  ThreadsPage,
  ThreadTriage,
  TriageCounts,
} from "../api/types";

export interface ListThreadsParams {
  accountId?: string;
  folderType?: string;
  q?: string;
  priority?: string;
  triage?: ThreadTriage;
  snoozed?: boolean;
  page?: number;
  limit?: number;
}

export async function listThreads(
  params: ListThreadsParams = {},
): Promise<ThreadsPage> {
  const query = new URLSearchParams();
  if (params.accountId) query.set("accountId", params.accountId);
  if (params.folderType) query.set("folderType", params.folderType);
  if (params.q) query.set("q", params.q);
  if (params.priority) query.set("priority", params.priority);
  if (params.triage) query.set("triage", params.triage);
  if (params.snoozed) query.set("snoozed", "true");
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch<ThreadsPage>(`/email/threads${qs ? `?${qs}` : ""}`);
}

export async function getTriageCounts(accountId?: string): Promise<TriageCounts> {
  const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
  return apiFetch<TriageCounts>(`/email/threads/triage-counts${qs}`);
}

export async function previewNewsletterCleanup(
  olderThanDays: number,
  accountId?: string,
): Promise<{ count: number }> {
  const query = new URLSearchParams({ olderThanDays: String(olderThanDays) });
  if (accountId) query.set("accountId", accountId);
  return apiFetch<{ count: number }>(
    `/email/threads/cleanup-newsletters?${query.toString()}`,
  );
}

export interface NewsletterCleanupResult {
  archived: number;
  failed: number;
  remaining: number;
}

/** Archives old inbox newsletters in the mailbox itself, not only here. */
export async function cleanupNewsletters(
  olderThanDays: number,
  accountId?: string,
): Promise<NewsletterCleanupResult> {
  return apiFetch<NewsletterCleanupResult>(
    "/email/threads/cleanup-newsletters",
    { method: "POST", body: { olderThanDays, accountId } },
  );
}

export interface UnsubscribeOptions {
  oneClickUrl?: string;
  url?: string;
  mailto?: { address: string; subject?: string; body?: string };
}

export async function getUnsubscribeOptions(
  threadId: string,
): Promise<UnsubscribeOptions> {
  return apiFetch<UnsubscribeOptions>(`/email/threads/${threadId}/unsubscribe`);
}

/** RFC 8058 one-click unsubscribe, sent by the server. */
export async function unsubscribeOneClick(threadId: string): Promise<void> {
  await apiFetch(`/email/threads/${threadId}/unsubscribe`, { method: "POST" });
}

export async function getThread(id: string): Promise<EmailThreadDetail> {
  return apiFetch<EmailThreadDetail>(`/email/threads/${id}`);
}

export async function snoozeThread(id: string, until: string): Promise<void> {
  await apiFetch(`/email/threads/${id}/snooze`, {
    method: "PATCH",
    body: { until },
  });
}

export async function unsnoozeThread(id: string): Promise<void> {
  await apiFetch(`/email/threads/${id}/unsnooze`, { method: "PATCH" });
}

/** Shared Inbox: assign a thread to a teammate, or pass null to unassign. */
export async function assignThread(
  id: string,
  assigneeUserId: string | null,
): Promise<void> {
  await apiFetch(`/email/threads/${id}/assign`, {
    method: "PATCH",
    body: { assigneeUserId },
  });
}

export async function addThreadNote(
  id: string,
  body: string,
): Promise<ThreadNote> {
  return apiFetch<ThreadNote>(`/email/threads/${id}/notes`, {
    method: "POST",
    body: { body },
  });
}

export async function deleteThreadNote(
  threadId: string,
  noteId: string,
): Promise<void> {
  await apiFetch(`/email/threads/${threadId}/notes/${noteId}`, {
    method: "DELETE",
  });
}

export interface FollowUpCandidate {
  threadId: string;
  subject: string | null;
  snippet: string | null;
  summary: string | null;
  lastMessageAt: string | null;
  daysSinceLastMessage: number | null;
  /** When "remind me if nobody replies" fires; null when no reminder is set. */
  followUpAt: string | null;
  /** The recipients of the user's last message, minus the account itself. */
  waitingOn: { name?: string; address: string }[];
  account: { id: string; provider: string; email: string };
  relatedMeetingRequests: { id: string; description: string }[];
}

/** Threads where the user sent the last message and nobody has answered,
 * waiting at least `olderThanDays` (0 = all of them). */
export async function listFollowUps(
  olderThanDays = 0,
): Promise<FollowUpCandidate[]> {
  return apiFetch<FollowUpCandidate[]>(
    `/email/follow-ups?olderThanDays=${olderThanDays}`,
  );
}

/** waiting=false hides a thread from the Waiting view (and cancels its
 * reminder) until the user sends another message on it. */
export async function setWaiting(
  threadId: string,
  waiting: boolean,
): Promise<void> {
  await apiFetch(`/email/threads/${threadId}/waiting`, {
    method: "PATCH",
    body: { waiting },
  });
}

/** Sets, or with null cancels, "remind me if nobody replies". */
export async function setFollowUpReminder(
  threadId: string,
  days: number | null,
): Promise<void> {
  await apiFetch(`/email/threads/${threadId}/follow-up-reminder`, {
    method: "PATCH",
    body: { days },
  });
}

export interface MessageWithAccount extends EmailMessage {
  thread: { folder: { accountId: string } };
}

export async function getMessage(id: string): Promise<MessageWithAccount> {
  return apiFetch<MessageWithAccount>(`/email/messages/${id}`);
}

/** Re-queues AI processing for a message whose processing failed. */
export async function retryAiProcessing(id: string): Promise<void> {
  await apiFetch(`/email/messages/${id}/retry-ai`, { method: "POST" });
}

export async function markMessageRead(id: string): Promise<void> {
  await apiFetch(`/email/messages/${id}/read`, { method: "POST" });
}

export interface RecipientInput {
  address: string;
  name?: string;
}

export interface ComposeInput {
  accountId: string;
  to: RecipientInput[];
  cc?: RecipientInput[];
  bcc?: RecipientInput[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  attachments?: AttachmentInput[];
  /** Follow-up task + notification if nobody replies within N days. */
  remindIfNoReplyDays?: number;
}

export async function sendEmail(data: ComposeInput): Promise<EmailMessage> {
  return apiFetch<EmailMessage>("/email/send", { method: "POST", body: data });
}

export interface ReplyInput {
  messageId: string;
  bodyHtml: string;
  bodyText?: string;
  /** Also copy everyone else on the message (minus your own addresses). */
  replyAll?: boolean;
  attachments?: AttachmentInput[];
  remindIfNoReplyDays?: number;
}

export async function replyToMessage(
  data: ReplyInput,
): Promise<EmailMessage> {
  return apiFetch<EmailMessage>("/email/reply", {
    method: "POST",
    body: data,
  });
}

export interface SaveDraftInput {
  accountId: string;
  to?: RecipientInput[];
  cc?: RecipientInput[];
  bcc?: RecipientInput[];
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
}

export type UpdateDraftInput = Omit<SaveDraftInput, "accountId">;

export async function saveDraft(data: SaveDraftInput): Promise<EmailMessage> {
  return apiFetch<EmailMessage>("/email/drafts", {
    method: "POST",
    body: data,
  });
}

export async function updateDraft(
  id: string,
  data: UpdateDraftInput,
): Promise<EmailMessage> {
  return apiFetch<EmailMessage>(`/email/drafts/${id}`, {
    method: "PATCH",
    body: data,
  });
}

export async function sendDraft(id: string): Promise<EmailMessage> {
  return apiFetch<EmailMessage>(`/email/drafts/${id}/send`, {
    method: "POST",
  });
}

/** Downloads an attachment (fetched from the mailbox by the API) and
 * hands it to the browser as a file. */
export async function downloadAttachment(
  id: string,
  filename: string,
): Promise<void> {
  const blob = await apiFetchBlob(`/email/attachments/${id}`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Stops a scheduled auto-reply from sending; it stays as a draft. */
export async function cancelScheduledSend(id: string): Promise<EmailMessage> {
  return apiFetch<EmailMessage>(`/email/drafts/${id}/cancel-scheduled-send`, {
    method: "POST",
  });
}

export async function listAccountFolders(
  accountId: string,
): Promise<MailFolderSummary[]> {
  return apiFetch<MailFolderSummary[]>(`/email/accounts/${accountId}/folders`);
}

export async function deleteDraft(id: string): Promise<void> {
  await apiFetch(`/email/drafts/${id}`, { method: "DELETE" });
}
