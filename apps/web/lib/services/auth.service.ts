import { apiFetch, apiUrl } from "../api/client";
import type { User } from "../api/types";
import type { TokenPair } from "../auth/token-storage";

export function googleLoginUrl(): string {
  return apiUrl("/auth/google");
}

export function microsoftLoginUrl(): string {
  return apiUrl("/auth/microsoft");
}

export interface AuthResult extends TokenPair {
  user: User;
}

export async function register(data: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<AuthResult> {
  return apiFetch<AuthResult>("/auth/register", {
    method: "POST",
    body: data,
    skipAuth: true,
  });
}

export async function loginWithPassword(data: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  return apiFetch<AuthResult>("/auth/login", {
    method: "POST",
    body: data,
    skipAuth: true,
  });
}

export async function verifyEmail(token: string): Promise<void> {
  await apiFetch<void>("/auth/verify-email", {
    method: "POST",
    body: { token },
    skipAuth: true,
  });
}

export async function resendVerification(): Promise<void> {
  await apiFetch<void>("/auth/resend-verification", { method: "POST" });
}

export async function forgotPassword(email: string): Promise<void> {
  await apiFetch<void>("/auth/forgot-password", {
    method: "POST",
    body: { email },
    skipAuth: true,
  });
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  await apiFetch<void>("/auth/reset-password", {
    method: "POST",
    body: { token, newPassword },
    skipAuth: true,
  });
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  return apiFetch<TokenPair>("/auth/refresh", {
    method: "POST",
    body: { refreshToken },
    skipAuth: true,
  });
}

export async function logout(refreshToken: string): Promise<void> {
  await apiFetch<void>("/auth/logout", {
    method: "POST",
    body: { refreshToken },
  });
}

export interface Session {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  deviceLabel: string | null;
  createdAt: string;
  isCurrent: boolean;
}

export async function getSessions(currentRefreshToken?: string): Promise<Session[]> {
  const qs = currentRefreshToken
    ? `?refreshToken=${encodeURIComponent(currentRefreshToken)}`
    : "";
  return apiFetch<Session[]>(`/auth/sessions${qs}`);
}

export async function revokeSession(id: string): Promise<void> {
  await apiFetch<void>(`/auth/sessions/${id}`, { method: "DELETE" });
}

export async function revokeAllSessions(): Promise<void> {
  await apiFetch<void>("/auth/sessions/revoke-all", { method: "POST" });
}
