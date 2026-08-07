import { apiFetch } from "../api/client";
import type { MeetingTimeSuggestion, Task, TaskStatus } from "../api/types";

export async function listTasks(status?: TaskStatus): Promise<Task[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const query = params.toString();
  return apiFetch(`/tasks${query ? `?${query}` : ""}`);
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<Task> {
  return apiFetch(`/tasks/${id}`, {
    method: "PATCH",
    body: { status },
  });
}

export async function suggestMeeting(
  taskId: string,
): Promise<MeetingTimeSuggestion> {
  return apiFetch(`/tasks/${taskId}/suggest-meeting`, { method: "POST" });
}

export interface ScheduleMeetingInput {
  calendarAccountId: string;
  start: string;
  end: string;
  title: string;
  attendeeEmail?: string;
}

export async function scheduleMeeting(
  taskId: string,
  data: ScheduleMeetingInput,
): Promise<{ task: Task; event: { id: string; htmlLink: string } }> {
  return apiFetch(`/tasks/${taskId}/schedule-meeting`, {
    method: "POST",
    body: data,
  });
}
