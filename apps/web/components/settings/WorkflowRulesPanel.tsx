import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import type {
  AccountMember,
  Integration,
  WorkflowAction,
  WorkflowActionType,
  WorkflowCondition,
  WorkflowConditionField,
  WorkflowConditionOperator,
} from "@/lib/api/types";
import { listAgents } from "@/lib/services/agents.service";
import { listAccountMembers } from "@/lib/services/email-accounts.service";
import { listIntegrations } from "@/lib/services/integrations.service";
import {
  createWorkflowRule,
  deleteWorkflowRule,
  listWorkflowRules,
  updateWorkflowRule,
} from "@/lib/services/workflow-rules.service";

import {
  ApprovalChainActionFields,
  HubspotActionFields,
  SlackActionFields,
  TeamsActionFields,
} from "./WorkflowActionFields";

const CONDITION_FIELDS: { value: WorkflowConditionField; label: string }[] = [
  { value: "category", label: "Category" },
  { value: "priority", label: "Priority" },
  { value: "sender", label: "Sender address" },
];

const CONDITION_OPERATORS: {
  value: WorkflowConditionOperator;
  label: string;
}[] = [
  { value: "equals", label: "equals" },
  { value: "contains", label: "contains" },
];

const ACTION_TYPES: { value: WorkflowActionType; label: string }[] = [
  { value: "AUTO_REPLY", label: "Auto-send the AI reply" },
  { value: "ASSIGN_TO", label: "Assign to teammate" },
  { value: "NOTIFY", label: "Notify teammate" },
  { value: "POST_TO_SLACK", label: "Post to Slack channel" },
  { value: "POST_TO_TEAMS", label: "Post to Teams channel" },
  { value: "CREATE_HUBSPOT_CONTACT", label: "Sync sender to HubSpot" },
  { value: "REQUIRE_APPROVAL", label: "Hold as draft (no auto-reply)" },
  { value: "REQUIRE_APPROVAL_CHAIN", label: "Require multi-step approval" },
];

function emptyCondition(): WorkflowCondition {
  return { field: "category", operator: "equals", value: "" };
}

function emptyAction(): WorkflowAction {
  return { type: "AUTO_REPLY" };
}

function actionOfType(type: WorkflowActionType, members: AccountMember[] | undefined): WorkflowAction {
  switch (type) {
    case "ASSIGN_TO":
    case "NOTIFY":
      return { type, userId: members?.[0]?.userId ?? "" };
    case "POST_TO_SLACK":
      return { type, integrationId: "", channelId: "" };
    case "POST_TO_TEAMS":
      return { type, integrationId: "", teamId: "", channelId: "" };
    case "CREATE_HUBSPOT_CONTACT":
      return { type, integrationId: "" };
    case "REQUIRE_APPROVAL_CHAIN":
      return { type, approverUserIds: [] };
    case "AUTO_REPLY":
    case "REQUIRE_APPROVAL":
      return { type };
  }
}

export function WorkflowRulesPanel({
  accountId,
  isOwner,
}: {
  accountId: string;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [conditions, setConditions] = useState<WorkflowCondition[]>([
    emptyCondition(),
  ]);
  const [actions, setActions] = useState<WorkflowAction[]>([emptyAction()]);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["workflow-rules", accountId],
    queryFn: () => listWorkflowRules(accountId),
  });

  const { data: members } = useQuery({
    queryKey: ["account-members", accountId],
    queryFn: () => listAccountMembers(accountId),
  });

  const { data: agents } = useQuery({
    queryKey: ["agents", accountId],
    queryFn: () => listAgents(accountId),
  });

  const { data: integrations } = useQuery({
    queryKey: ["integrations", accountId],
    queryFn: () => listIntegrations(accountId),
  });

  function invalidate() {
    return queryClient.invalidateQueries({
      queryKey: ["workflow-rules", accountId],
    });
  }

  const createMutation = useMutation({
    mutationFn: () => createWorkflowRule(accountId, { name, conditions, actions }),
    onSuccess: () => {
      setName("");
      setConditions([emptyCondition()]);
      setActions([emptyAction()]);
      setShowForm(false);
      void invalidate();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) =>
      updateWorkflowRule(accountId, ruleId, { enabled }),
    onSuccess: () => void invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => deleteWorkflowRule(accountId, ruleId),
    onSuccess: () => void invalidate(),
  });

  function memberLabel(userId: string) {
    const member = members?.find((m) => m.userId === userId);
    return member ? (member.user.displayName ?? member.user.email) : userId;
  }

  function describeCondition(condition: WorkflowCondition) {
    const fieldLabel =
      CONDITION_FIELDS.find((f) => f.value === condition.field)?.label ??
      condition.field;
    return `${fieldLabel} ${condition.operator} "${condition.value}"`;
  }

  function describeAction(action: WorkflowAction) {
    switch (action.type) {
      case "AUTO_REPLY": {
        const agent = action.agentId
          ? agents?.find((a) => a.id === action.agentId)
          : undefined;
        const base = agent
          ? `Auto-send reply as "${agent.name}"`
          : "Auto-send reply";
        return action.calendarAgent === false
          ? `${base} (calendar-aware replies off)`
          : base;
      }
      case "ASSIGN_TO":
        return `Assign to ${memberLabel(action.userId)}`;
      case "NOTIFY":
        return `Notify ${memberLabel(action.userId)}`;
      case "POST_TO_SLACK": {
        const integration = integrations?.find(
          (i) => i.id === action.integrationId,
        );
        return `Post to Slack${integration ? ` (${integration.workspaceName ?? "workspace"})` : ""}`;
      }
      case "POST_TO_TEAMS": {
        const integration = integrations?.find(
          (i) => i.id === action.integrationId,
        );
        return `Post to Teams${integration ? ` (${integration.workspaceName ?? "tenant"})` : ""}`;
      }
      case "CREATE_HUBSPOT_CONTACT": {
        const integration = integrations?.find(
          (i) => i.id === action.integrationId,
        );
        return `Sync sender to HubSpot${integration ? ` (${integration.workspaceName ?? "portal"})` : ""}`;
      }
      case "REQUIRE_APPROVAL":
        return "Hold as draft";
      case "REQUIRE_APPROVAL_CHAIN":
        return `Require approval from ${action.approverUserIds.map(memberLabel).join(" → ")}`;
    }
  }

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <p className="mb-2 text-xs text-zinc-500">
        Rules run in order on every new message, after AI classification.
        The first rule whose conditions all match wins; its actions run. No
        match falls back to holding the AI reply as a draft for you to
        review.
      </p>

      {isLoading && <p className="text-xs text-zinc-400">Loading rules…</p>}

      <ul className="mb-3 space-y-2">
        {rules?.map((rule) => (
          <li key={rule.id} className="rounded-md border border-zinc-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-zinc-900">{rule.name}</p>
              {isOwner && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      toggleMutation.mutate({
                        ruleId: rule.id,
                        enabled: !rule.enabled,
                      })
                    }
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                      rule.enabled
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-zinc-100 text-zinc-500 ring-zinc-200",
                    )}
                  >
                    {rule.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(rule.id)}
                    loading={
                      deleteMutation.isPending &&
                      deleteMutation.variables === rule.id
                    }
                  >
                    Delete
                  </Button>
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              When{" "}
              {rule.conditions.length === 0
                ? "any message arrives"
                : rule.conditions.map(describeCondition).join(" and ")}
            </p>
            <p className="text-xs text-zinc-500">
              Then: {rule.actions.map(describeAction).join(", ")}
            </p>
          </li>
        ))}
        {rules?.length === 0 && !isLoading && (
          <li className="text-xs text-zinc-400">
            No rules yet — unmatched messages are always held as drafts.
          </li>
        )}
      </ul>

      {isOwner && !showForm && (
        <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
          + Add rule
        </Button>
      )}

      {isOwner && showForm && (
        <form
          className="space-y-3 rounded-md border border-zinc-200 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <input
            type="text"
            required
            placeholder="Rule name, e.g. Auto-reply to Support"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          />

          <div>
            <p className="mb-1 text-xs font-medium text-zinc-600">
              When all of these match:
            </p>
            <div className="space-y-1.5">
              {conditions.map((condition, i) => (
                <div key={i} className="flex gap-1.5">
                  <select
                    value={condition.field}
                    onChange={(e) =>
                      setConditions(
                        conditions.map((c, j) =>
                          j === i
                            ? {
                                ...c,
                                field: e.target.value as WorkflowConditionField,
                              }
                            : c,
                        ),
                      )
                    }
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                  >
                    {CONDITION_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={condition.operator}
                    onChange={(e) =>
                      setConditions(
                        conditions.map((c, j) =>
                          j === i
                            ? {
                                ...c,
                                operator: e.target
                                  .value as WorkflowConditionOperator,
                              }
                            : c,
                        ),
                      )
                    }
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                  >
                    {CONDITION_OPERATORS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    required
                    placeholder="value"
                    value={condition.value}
                    onChange={(e) =>
                      setConditions(
                        conditions.map((c, j) =>
                          j === i ? { ...c, value: e.target.value } : c,
                        ),
                      )
                    }
                    className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs"
                  />
                  {conditions.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setConditions(conditions.filter((_, j) => j !== i))
                      }
                      className="px-1 text-xs text-zinc-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setConditions([...conditions, emptyCondition()])}
              className="mt-1 text-xs text-indigo-600 hover:underline"
            >
              + Add condition
            </button>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-zinc-600">
              Then do this:
            </p>
            <div className="space-y-1.5">
              {actions.map((action, i) => (
                <div key={i} className="flex flex-wrap gap-1.5">
                  <select
                    value={action.type}
                    onChange={(e) => {
                      const type = e.target.value as WorkflowActionType;
                      const next = actionOfType(type, members);
                      setActions(actions.map((a, j) => (j === i ? next : a)));
                    }}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                  >
                    {ACTION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {action.type === "AUTO_REPLY" &&
                    agents &&
                    agents.length > 0 && (
                      <select
                        value={action.agentId ?? ""}
                        onChange={(e) =>
                          setActions(
                            actions.map((a, j) =>
                              j === i && a.type === "AUTO_REPLY"
                                ? {
                                    ...a,
                                    agentId: e.target.value || undefined,
                                  }
                                : a,
                            ),
                          )
                        }
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                      >
                        <option value="">Default reply prompt</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                    )}
                  {action.type === "AUTO_REPLY" && (
                    <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                      <input
                        type="checkbox"
                        checked={action.calendarAgent !== false}
                        onChange={(e) =>
                          setActions(
                            actions.map((a, j) =>
                              j === i && a.type === "AUTO_REPLY"
                                ? { ...a, calendarAgent: e.target.checked }
                                : a,
                            ),
                          )
                        }
                      />
                      Calendar-aware replies
                    </label>
                  )}
                  {(action.type === "ASSIGN_TO" || action.type === "NOTIFY") && (
                    <select
                      value={action.userId}
                      onChange={(e) =>
                        setActions(
                          actions.map((a, j) =>
                            j === i &&
                            (a.type === "ASSIGN_TO" || a.type === "NOTIFY")
                              ? { ...a, userId: e.target.value }
                              : a,
                          ),
                        )
                      }
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                    >
                      {members?.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.user.displayName ?? m.user.email}
                        </option>
                      ))}
                    </select>
                  )}
                  {action.type === "POST_TO_SLACK" && (
                    <SlackActionFields
                      action={action}
                      integrations={integrations}
                      onChange={(next) =>
                        setActions(actions.map((a, j) => (j === i ? next : a)))
                      }
                    />
                  )}
                  {action.type === "POST_TO_TEAMS" && (
                    <TeamsActionFields
                      action={action}
                      integrations={integrations}
                      onChange={(next) =>
                        setActions(actions.map((a, j) => (j === i ? next : a)))
                      }
                    />
                  )}
                  {action.type === "CREATE_HUBSPOT_CONTACT" && (
                    <HubspotActionFields
                      action={action}
                      integrations={integrations}
                      onChange={(next) =>
                        setActions(actions.map((a, j) => (j === i ? next : a)))
                      }
                    />
                  )}
                  {action.type === "REQUIRE_APPROVAL_CHAIN" && (
                    <ApprovalChainActionFields
                      action={action}
                      members={members}
                      onChange={(next) =>
                        setActions(actions.map((a, j) => (j === i ? next : a)))
                      }
                    />
                  )}
                  {actions.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setActions(actions.filter((_, j) => j !== i))
                      }
                      className="px-1 text-xs text-zinc-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setActions([...actions, emptyAction()])}
              className="mt-1 text-xs text-indigo-600 hover:underline"
            >
              + Add action
            </button>
          </div>

          {createMutation.isError && (
            <p className="text-xs text-red-600">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : "Could not create rule"}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={createMutation.isPending}>
              Save rule
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
