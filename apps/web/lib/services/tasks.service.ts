import { apiFetch } from "../api/client";
import type { Task, TaskStatus } from "../api/types";

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
