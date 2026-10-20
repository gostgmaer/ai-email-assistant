import { apiFetch } from "../api/client";
import type {
  RuleDryRunResult,
  WorkflowAction,
  WorkflowConditionGroup,
  WorkflowRule,
} from "../api/types";

export async function listWorkflowRules(
  accountId: string,
): Promise<WorkflowRule[]> {
  return apiFetch<WorkflowRule[]>(`/email-accounts/${accountId}/workflow-rules`);
}

export interface WorkflowRuleInput {
  name: string;
  enabled?: boolean;
  order?: number;
  conditions: WorkflowConditionGroup;
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

/** Tests a saved rule against the last 50 classified messages. */
export async function dryRunWorkflowRule(
  accountId: string,
  ruleId: string,
): Promise<RuleDryRunResult> {
  return apiFetch<RuleDryRunResult>(
    `/email-accounts/${accountId}/workflow-rules/${ruleId}/dry-run`,
    { method: "POST" },
  );
}

/** Tests conditions that aren't saved yet. */
export async function dryRunConditions(
  accountId: string,
  data: { conditions: WorkflowConditionGroup; actions?: WorkflowAction[] },
): Promise<RuleDryRunResult> {
  return apiFetch<RuleDryRunResult>(
    `/email-accounts/${accountId}/workflow-rules/dry-run`,
    { method: "POST", body: data },
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
