import { apiFetch, apiUrl } from "../api/client";
import { getAccessToken } from "../auth/token-storage";
import type { Integration, IntegrationChannel } from "../api/types";

export async function listIntegrations(
  accountId: string,
): Promise<Integration[]> {
  return apiFetch<Integration[]>(
    `/integrations?accountId=${encodeURIComponent(accountId)}`,
  );
}

/**
 * Slack connect is a full-page redirect (to slack.com), so it can't carry
 * an Authorization header — the access token and target account ride
 * along as query params instead (the API's JwtStrategy accepts a `token`
 * query param; the connect route reads `accountId` the same way).
 */
export function connectSlackUrl(accountId: string): string {
  const token = getAccessToken();
  const params = new URLSearchParams({
    accountId,
    token: token ?? "",
  });
  return `${apiUrl("/integrations/connect/slack")}?${params.toString()}`;
}

export async function listSlackChannels(
  integrationId: string,
): Promise<IntegrationChannel[]> {
  return apiFetch<IntegrationChannel[]>(
    `/integrations/${integrationId}/channels`,
  );
}

export async function disconnectIntegration(id: string): Promise<void> {
  await apiFetch(`/integrations/${id}`, { method: "DELETE" });
}
