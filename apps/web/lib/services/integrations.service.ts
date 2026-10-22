import { apiFetch } from "../api/client";
import { connectLink } from "../connect";
import type { Integration, IntegrationChannel, TeamsChannel } from "../api/types";

export async function listIntegrations(
  accountId: string,
): Promise<Integration[]> {
  return apiFetch<Integration[]>(
    `/integrations?accountId=${encodeURIComponent(accountId)}`,
  );
}

/**
 * Connect is a full-page redirect to the provider's own consent screen,
 * started through /connect (see lib/connect.ts): a short-lived ticket and
 * the target account ride along as query params.
 */
function connectUrl(provider: "slack" | "teams" | "hubspot", accountId: string): string {
  return connectLink(`/integrations/connect/${provider}`, { accountId });
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
