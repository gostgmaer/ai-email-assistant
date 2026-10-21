import { apiFetch, apiUrl } from "../api/client";
import { getAccessToken } from "../auth/token-storage";
import type {
  AccountMember,
  AutomationLogEntry,
  AutomationMetrics,
  EmailAccount,
} from "../api/types";

export async function listEmailAccounts(): Promise<EmailAccount[]> {
  return apiFetch<EmailAccount[]>("/email-accounts");
}

/**
 * Gmail/Outlook connect is a full-page redirect (to Google/Microsoft), so it
 * can't carry an Authorization header — the access token rides along as a
 * query param instead (the API's JwtStrategy accepts both).
 */
export function connectGoogleUrl(): string {
  const token = getAccessToken();
  return `${apiUrl("/email-accounts/connect/google")}?token=${encodeURIComponent(token ?? "")}`;
}

export function connectMicrosoftUrl(): string {
  const token = getAccessToken();
  return `${apiUrl("/email-accounts/connect/microsoft")}?token=${encodeURIComponent(token ?? "")}`;
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
