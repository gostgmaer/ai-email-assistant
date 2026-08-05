import { apiFetch, apiUrl } from "../api/client";
import { getAccessToken } from "../auth/token-storage";
import type { EmailAccount } from "../api/types";

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
    autoSendCategories?: string[];
    filterMarketing?: boolean;
    filterOtp?: boolean;
    filterPasswordReset?: boolean;
    filterBilling?: boolean;
    filterShipping?: boolean;
    filterCalendar?: boolean;
  },
): Promise<EmailAccount> {
  return apiFetch<EmailAccount>(`/email-accounts/${id}`, {
    method: "PATCH",
    body: data,
  });
}

export async function disconnectEmailAccount(id: string): Promise<void> {
  await apiFetch(`/email-accounts/${id}`, { method: "DELETE" });
}

export async function triggerSync(id: string): Promise<void> {
  await apiFetch(`/email-accounts/${id}/sync`, { method: "POST" });
}
