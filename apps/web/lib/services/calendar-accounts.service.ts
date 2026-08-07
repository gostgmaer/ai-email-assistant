import { apiFetch, apiUrl } from "../api/client";
import { getAccessToken } from "../auth/token-storage";
import type { BusyInterval, CalendarAccount } from "../api/types";

export async function listCalendarAccounts(): Promise<CalendarAccount[]> {
  return apiFetch<CalendarAccount[]>("/calendar-accounts");
}

/**
 * Full-page redirect (to Google/Microsoft), so it can't carry an
 * Authorization header — the access token rides along as a query param
 * instead, same as the email-accounts connect flow.
 */
export function connectGoogleCalendarUrl(): string {
  const token = getAccessToken();
  return `${apiUrl("/calendar-accounts/connect/google")}?token=${encodeURIComponent(token ?? "")}`;
}

export function connectMicrosoftCalendarUrl(): string {
  const token = getAccessToken();
  return `${apiUrl("/calendar-accounts/connect/microsoft")}?token=${encodeURIComponent(token ?? "")}`;
}

export async function disconnectCalendarAccount(id: string): Promise<void> {
  await apiFetch(`/calendar-accounts/${id}`, { method: "DELETE" });
}

export async function getAvailability(
  accountId: string,
  timeMin: string,
  timeMax: string,
): Promise<BusyInterval[]> {
  const params = new URLSearchParams({ timeMin, timeMax });
  return apiFetch<BusyInterval[]>(
    `/calendar/${accountId}/availability?${params}`,
  );
}
