import { apiFetch } from "../api/client";
import type { WorkflowAction, WorkflowCondition, WorkflowRule } from "../api/types";

export async function listWorkflowRules(
  accountId: string,
): Promise<WorkflowRule[]> {
  return apiFetch<WorkflowRule[]>(`/email-accounts/${accountId}/workflow-rules`);
}

export interface WorkflowRuleInput {
  name: string;
  enabled?: boolean;
  order?: number;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
}

export async function createWorkflowRule(
  accountId: string,
  data: WorkflowRuleInput,
): Promise<WorkflowRule> {
  return apiFetch<WorkflowRule>(`/email-accounts/${accountId}/workflow-rules`, {
    method: "POST",
    body: data,
  });
}

export async function updateWorkflowRule(
  accountId: string,
  ruleId: string,
  data: Partial<WorkflowRuleInput>,
): Promise<WorkflowRule> {
  return apiFetch<WorkflowRule>(
    `/email-accounts/${accountId}/workflow-rules/${ruleId}`,
    { method: "PATCH", body: data },
  );
}

export async function deleteWorkflowRule(
  accountId: string,
  ruleId: string,
): Promise<void> {
  await apiFetch(`/email-accounts/${accountId}/workflow-rules/${ruleId}`, {
    method: "DELETE",
  });
}
