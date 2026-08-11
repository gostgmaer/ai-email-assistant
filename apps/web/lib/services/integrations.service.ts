import { apiFetch, apiUrl } from "../api/client";
import { getAccessToken } from "../auth/token-storage";
import type { Integration, IntegrationChannel, TeamsChannel } from "../api/types";

export async function listIntegrations(
  accountId: string,
): Promise<Integration[]> {
  return apiFetch<Integration[]>(
    `/integrations?accountId=${encodeURIComponent(accountId)}`,
  );
}

/**
 * Connect is a full-page redirect to the provider's own consent screen, so
 * it can't carry an Authorization header — the access token and target
 * account ride along as query params instead (the API's JwtStrategy
 * accepts a `token` query param; the connect route reads `accountId` the
 * same way).
 */
function connectUrl(provider: "slack" | "teams" | "hubspot", accountId: string): string {
  const token = getAccessToken();
  const params = new URLSearchParams({
    accountId,
    token: token ?? "",
  });
  return `${apiUrl(`/integrations/connect/${provider}`)}?${params.toString()}`;
}

export function connectSlackUrl(accountId: string): string {
  return connectUrl("slack", accountId);
}

export function connectTeamsUrl(accountId: string): string {
  return connectUrl("teams", accountId);
}

export function connectHubspotUrl(accountId: string): string {
  return connectUrl("hubspot", accountId);
}

export async function listSlackChannels(
  integrationId: string,
): Promise<IntegrationChannel[]> {
  return apiFetch<IntegrationChannel[]>(
    `/integrations/${integrationId}/channels`,
  );
}

export async function listTeamsChannels(
  integrationId: string,
): Promise<TeamsChannel[]> {
  return apiFetch<TeamsChannel[]>(
    `/integrations/${integrationId}/teams-channels`,
  );
}

export async function disconnectIntegration(id: string): Promise<void> {
  await apiFetch(`/integrations/${id}`, { method: "DELETE" });
}
