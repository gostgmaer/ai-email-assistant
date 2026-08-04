import { apiFetch } from "../api/client";
import type { User } from "../api/types";

export async function getMe(): Promise<User> {
  return apiFetch<User>("/users/me");
}

export async function updateMe(data: {
  displayName?: string;
  avatar?: string;
}): Promise<User> {
  return apiFetch<User>("/users/me", { method: "PATCH", body: data });
}

export async function deleteMe(): Promise<void> {
  await apiFetch<void>("/users/me", { method: "DELETE" });
}
