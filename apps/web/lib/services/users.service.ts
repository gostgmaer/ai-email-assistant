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

export async function changePassword(data: {
  currentPassword?: string;
  newPassword: string;
}): Promise<void> {
  await apiFetch<void>("/users/me/password", { method: "PATCH", body: data });
}

export async function requestEmailChange(data: {
  newEmail: string;
  currentPassword?: string;
}): Promise<void> {
  await apiFetch<void>("/users/me/email", { method: "POST", body: data });
}

export async function confirmEmailChange(token: string): Promise<User> {
  return apiFetch<User>("/users/me/email/confirm", {
    method: "POST",
    body: { token },
  });
}
