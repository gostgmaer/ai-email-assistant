import { apiFetch } from "../api/client";
import type { NotificationsPage } from "../api/types";

export async function listNotifications(
  params: { page?: number; limit?: number; unreadOnly?: boolean } = {},
): Promise<NotificationsPage> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.unreadOnly) query.set("unreadOnly", "true");
  const qs = query.toString();
  return apiFetch<NotificationsPage>(`/notifications${qs ? `?${qs}` : ""}`);
}

export async function unreadCount(): Promise<{ count: number }> {
  return apiFetch("/notifications/unread-count");
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch(`/notifications/${id}/read`, { method: "POST" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch("/notifications/read-all", { method: "POST" });
}
