import { apiFetch, apiUrl } from "../api/client";
import type { TokenPair } from "../auth/token-storage";

export function googleLoginUrl(): string {
  return apiUrl("/auth/google");
}

export function microsoftLoginUrl(): string {
  return apiUrl("/auth/microsoft");
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
