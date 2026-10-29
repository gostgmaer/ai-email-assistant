import { apiFetch } from "../api/client";
import { connectLink } from "../connect";
import type {
  AccountMember,
  AutomationLogEntry,
  AutomationMetrics,
  EmailAccount,
  WritingStyle,
  WritingStyleView,
} from "../api/types";

export async function listEmailAccounts(): Promise<EmailAccount[]> {
  return apiFetch<EmailAccount[]>("/email-accounts");
}

/** Gmail/Outlook connect is a full-page redirect to Google/Microsoft,
 * started through /connect so a short-lived ticket — not the access
 * token — goes in the URL. */
export function connectGoogleUrl(): string {
  return connectLink("/email-accounts/connect/google");
}

export function connectMicrosoftUrl(): string {
  return connectLink("/email-accounts/connect/microsoft");
}

export interface ConnectImapInput {
  email: string;
  displayName?: string;
  username: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecure?: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure?: boolean;
}

export async function connectImap(
  data: ConnectImapInput,
): Promise<EmailAccount> {
  return apiFetch<EmailAccount>("/email-accounts/connect/imap", {
    method: "POST",
    body: data,
  });
}

export async function updateEmailAccount(
  id: string,
  data: {
    displayName?: string;
    isPrimary?: boolean;
    syncEnabled?: boolean;
    autoScheduleMeetings?: boolean;
    filterMarketing?: boolean;
    filterOtp?: boolean;
    filterPasswordReset?: boolean;
    filterBilling?: boolean;
    filterShipping?: boolean;
    filterCalendar?: boolean;
    keepNewsletters?: boolean;
    prohibitedPhrases?: string[];
    autoSendEnabled?: boolean;
    autoSendHourlyCap?: number;
    autoSendDailyCap?: number;
    autoSendConfidenceThreshold?: number;
    quietHoursStart?: string | null;
    quietHoursEnd?: string | null;
    undoSendSeconds?: number;
    businessHoursStart?: string;
    businessHoursEnd?: string;
    businessDays?: number[];
    signatureText?: string | null;
    signatureHtml?: string | null;
  },
): Promise<EmailAccount> {
  return apiFetch<EmailAccount>(`/email-accounts/${id}`, {
    method: "PATCH",
    body: data,
  });
}

/** Autonomous sends and rule runs on an account, newest first (owner
 * only). Pass the last entry's `at` as `before` for the next page. */
export async function getAutomationLog(
  accountId: string,
  before?: string,
): Promise<AutomationLogEntry[]> {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  return apiFetch<AutomationLogEntry[]>(
    `/email-accounts/${accountId}/automation-log${query}`,
  );
}

/** AI draft quality over the last `days` days, overall and per agent. */
export async function getAutomationMetrics(
  accountId: string,
  days = 30,
): Promise<AutomationMetrics> {
  return apiFetch<AutomationMetrics>(
    `/analytics/automation?accountId=${encodeURIComponent(accountId)}&days=${days}`,
  );
}

export async function disconnectEmailAccount(id: string): Promise<void> {
  await apiFetch(`/email-accounts/${id}`, { method: "DELETE" });
}

export async function triggerSync(id: string): Promise<void> {
  await apiFetch(`/email-accounts/${id}/sync`, { method: "POST" });
}

export async function listAccountMembers(
  accountId: string,
): Promise<AccountMember[]> {
  return apiFetch<AccountMember[]>(`/email-accounts/${accountId}/members`);
}

export async function inviteAccountMember(
  accountId: string,
  email: string,
): Promise<AccountMember> {
  return apiFetch<AccountMember>(`/email-accounts/${accountId}/members`, {
    method: "POST",
    body: { email },
  });
}

export async function removeAccountMember(
  accountId: string,
  userId: string,
): Promise<void> {
  await apiFetch(`/email-accounts/${accountId}/members/${userId}`, {
    method: "DELETE",
  });
}

/** The account's writing style, or null until it has been built. */
export async function getWritingStyle(
  accountId: string,
): Promise<WritingStyleView | null> {
  const { style } = await apiFetch<{ style: WritingStyleView | null }>(
    `/email-accounts/${accountId}/writing-style`,
  );
  return style;
}

/** Edit the profile (the weekly rebuild then leaves it alone) or turn it
 * on or off. Owner only. */
export async function updateWritingStyle(
  accountId: string,
  changes: { enabled?: boolean; profile?: Partial<WritingStyle> },
): Promise<WritingStyleView> {
  return apiFetch<WritingStyleView>(
    `/email-accounts/${accountId}/writing-style`,
    { method: "PATCH", body: changes },
  );
}

/** Learn the profile again from the latest sent mail, replacing edits. */
export async function rebuildWritingStyle(
  accountId: string,
): Promise<WritingStyleView> {
  return apiFetch<WritingStyleView>(
    `/email-accounts/${accountId}/writing-style/rebuild`,
    { method: "POST" },
  );
}
