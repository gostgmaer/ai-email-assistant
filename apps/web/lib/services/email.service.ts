import { apiFetch } from "../api/client";
import type {
  EmailMessage,
  EmailThreadDetail,
  ThreadNote,
  ThreadsPage,
} from "../api/types";

export interface ListThreadsParams {
  accountId?: string;
  folderType?: string;
  q?: string;
  priority?: string;
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
  if (params.snoozed) query.set("snoozed", "true");
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch<ThreadsPage>(`/email/threads${qs ? `?${qs}` : ""}`);
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
  lastMessageAt: string | null;
  daysSinceLastMessage: number | null;
  account: { id: string; provider: string; email: string };
  relatedMeetingRequests: { id: string; description: string }[];
}

export async function listFollowUps(): Promise<FollowUpCandidate[]> {
  return apiFetch<FollowUpCandidate[]>("/email/follow-ups");
}

export interface MessageWithAccount extends EmailMessage {
  thread: { folder: { accountId: string } };
}

export async function getMessage(id: string): Promise<MessageWithAccount> {
  return apiFetch<MessageWithAccount>(`/email/messages/${id}`);
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
}

export async function sendEmail(data: ComposeInput): Promise<EmailMessage> {
  return apiFetch<EmailMessage>("/email/send", { method: "POST", body: data });
}

export interface ReplyInput {
  messageId: string;
  bodyHtml: string;
  bodyText?: string;
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

export async function deleteDraft(id: string): Promise<void> {
  await apiFetch(`/email/drafts/${id}`, { method: "DELETE" });
}
