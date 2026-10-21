import { apiFetch } from "../api/client";
import type { Agent, AgentTemplate } from "../api/types";

export async function listAgents(accountId: string): Promise<Agent[]> {
  return apiFetch<Agent[]>(`/email-accounts/${accountId}/agents`);
}

/** Ready-made personas (the API is the source of truth for these). */
export async function listAgentTemplates(
  accountId: string,
): Promise<AgentTemplate[]> {
  return apiFetch<AgentTemplate[]>(
    `/email-accounts/${accountId}/agents/templates`,
  );
}

/** Creates the agent plus the template's suggested rules — the rules
 * start disabled. */
export async function createAgentFromTemplate(
  accountId: string,
  templateId: string,
): Promise<{ agent: Agent }> {
  return apiFetch<{ agent: Agent }>(
    `/email-accounts/${accountId}/agents/from-template/${templateId}`,
    { method: "POST" },
  );
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
