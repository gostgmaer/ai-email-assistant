import { apiFetch } from "../api/client";
import type { Agent } from "../api/types";

export async function listAgents(accountId: string): Promise<Agent[]> {
  return apiFetch<Agent[]>(`/email-accounts/${accountId}/agents`);
}

export interface AgentInput {
  name: string;
  systemPrompt: string;
  enabled?: boolean;
}

export async function createAgent(
  accountId: string,
  data: AgentInput,
): Promise<Agent> {
  return apiFetch<Agent>(`/email-accounts/${accountId}/agents`, {
    method: "POST",
    body: data,
  });
}

export async function updateAgent(
  accountId: string,
  agentId: string,
  data: Partial<AgentInput>,
): Promise<Agent> {
  return apiFetch<Agent>(`/email-accounts/${accountId}/agents/${agentId}`, {
    method: "PATCH",
    body: data,
  });
}

export async function deleteAgent(
  accountId: string,
  agentId: string,
): Promise<void> {
  await apiFetch(`/email-accounts/${accountId}/agents/${agentId}`, {
    method: "DELETE",
  });
}
