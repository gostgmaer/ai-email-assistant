import { apiFetch } from "../api/client";
import { connectLink } from "../connect";
import type { BusyInterval, CalendarAccount } from "../api/types";

export async function listCalendarAccounts(): Promise<CalendarAccount[]> {
  return apiFetch<CalendarAccount[]>("/calendar-accounts");
}

/** Full-page redirect to Google/Microsoft, started through /connect so a
 * short-lived ticket — not the access token — goes in the URL. */
export function connectGoogleCalendarUrl(): string {
  return connectLink("/calendar-accounts/connect/google");
}

export function connectMicrosoftCalendarUrl(): string {
  return connectLink("/calendar-accounts/connect/microsoft");
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
