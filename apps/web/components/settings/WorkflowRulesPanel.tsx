import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import type {
  AccountMember,
  Integration,
  RuleDryRunResult,
  WorkflowAction,
  WorkflowActionType,
} from "@/lib/api/types";
import { listAgents } from "@/lib/services/agents.service";
import { listAccountMembers } from "@/lib/services/email-accounts.service";
import { listIntegrations } from "@/lib/services/integrations.service";
import {
  createWorkflowRule,
  deleteWorkflowRule,
  dryRunConditions,
  dryRunWorkflowRule,
  listWorkflowRules,
  updateWorkflowRule,
} from "@/lib/services/workflow-rules.service";

import {
  RuleActionExtraFields,
  hasExtraFields,
} from "./RuleActionExtraFields";
import {
  type ConditionsDraft,
  RuleConditionsEditor,
  describeConditions,
  emptyConditionsDraft,
  toConditionGroup,
} from "./RuleConditionsEditor";
import { RuleTestResults } from "./RuleTestResults";
import {
  ApprovalChainActionFields,
  HubspotActionFields,
  SlackActionFields,
  TeamsActionFields,
} from "./WorkflowActionFields";

const ACTION_TYPES: { value: WorkflowActionType; label: string }[] = [
  { value: "AUTO_REPLY", label: "Auto-send the AI reply" },
  { value: "ASSIGN_TO", label: "Assign to teammate" },
  { value: "NOTIFY", label: "Notify teammate" },
  { value: "POST_TO_SLACK", label: "Post to Slack channel" },
  { value: "POST_TO_TEAMS", label: "Post to Teams channel" },
  { value: "CREATE_HUBSPOT_CONTACT", label: "Sync sender to HubSpot" },
  { value: "REQUIRE_APPROVAL", label: "Hold as draft (no auto-reply)" },
  { value: "REQUIRE_APPROVAL_CHAIN", label: "Require multi-step approval" },
  { value: "FORWARD", label: "Forward to address" },
  { value: "ADD_LABEL", label: "Add label" },
  { value: "MOVE_TO_FOLDER", label: "Move to folder" },
  { value: "ARCHIVE", label: "Archive" },
  { value: "MARK_READ", label: "Mark as read" },
  { value: "SNOOZE", label: "Snooze thread" },
  { value: "CREATE_TASK", label: "Create a task" },
  { value: "WEBHOOK", label: "Call a webhook" },
  { value: "DELAY_SEND", label: "Delay the auto-reply" },
  { value: "STOP_PROCESSING", label: "Stop (skip lower rules)" },
];

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
    case "FORWARD":
      return { type, to: "" };
    case "ADD_LABEL":
      return { type, label: "" };
    case "MOVE_TO_FOLDER":
      return { type, folderId: "" };
    case "SNOOZE":
      return { type, minutes: 24 * 60 };
    case "WEBHOOK":
      return { type, url: "" };
    case "DELAY_SEND":
      return { type, minutes: 5 };
    case "CREATE_TASK":
    case "AUTO_REPLY":
    case "REQUIRE_APPROVAL":
    case "ARCHIVE":
    case "MARK_READ":
    case "STOP_PROCESSING":
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
  const [conditions, setConditions] = useState<ConditionsDraft>(
    emptyConditionsDraft,
  );
  const [actions, setActions] = useState<WorkflowAction[]>([emptyAction()]);
  // Which rule's "Test rule" result is showing ("form" = the unsaved one).
  const [testResult, setTestResult] = useState<{
    key: string;
    result: RuleDryRunResult;
  } | null>(null);

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
    mutationFn: () =>
      createWorkflowRule(accountId, {
        name,
        conditions: toConditionGroup(conditions),
        actions,
      }),
    onSuccess: () => {
      setName("");
      setConditions(emptyConditionsDraft());
      setActions([emptyAction()]);
      setShowForm(false);
      setTestResult(null);
      void invalidate();
    },
  });

  const testMutation = useMutation({
    mutationFn: (ruleId?: string) =>
      ruleId
        ? dryRunWorkflowRule(accountId, ruleId)
        : dryRunConditions(accountId, {
            conditions: toConditionGroup(conditions),
            actions,
          }),
    onSuccess: (result, ruleId) =>
      setTestResult({ key: ruleId ?? "form", result }),
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
      case "FORWARD":
        return `Forward to ${action.to}`;
      case "ADD_LABEL":
        return `Label "${action.label}"`;
      case "MOVE_TO_FOLDER":
        return "Move to folder";
      case "ARCHIVE":
        return "Archive";
      case "MARK_READ":
        return "Mark as read";
      case "SNOOZE":
        return `Snooze ${Math.round(action.minutes / 60)}h`;
      case "CREATE_TASK":
        return `Create task${action.description ? ` "${action.description}"` : ""}`;
      case "WEBHOOK": {
        let host = action.url;
        try {
          host = new URL(action.url).host;
        } catch {
          // Show the raw value.
        }
        return `Webhook to ${host}${action.secret ? ` (signing secret ${action.secret})` : ""}`;
      }
      case "DELAY_SEND":
        return `Delay auto-reply ${action.minutes} min`;
      case "STOP_PROCESSING":
        return "Stop processing lower rules";
    }
  }

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <p className="mb-2 text-xs text-zinc-500">
        Rules run in order on every new message, after AI classification.
        Every rule that matches runs its actions, until one says
        &quot;Stop&quot;. How the reply goes out (auto-send, hold, approval)
        is decided by the first matching rule that says; no such rule falls
        back to holding the AI reply as a draft for you to review.
      </p>

      {isLoading && <p className="text-xs text-zinc-400">Loading rules…</p>}

      <ul className="mb-3 space-y-2">
        {rules?.map((rule) => (
          <li key={rule.id} className="rounded-md border border-zinc-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-zinc-900">{rule.name}</p>
              {isOwner && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => testMutation.mutate(rule.id)}
                    loading={
                      testMutation.isPending &&
                      testMutation.variables === rule.id
                    }
                  >
                    Test
                  </Button>
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
              When {describeConditions(rule.conditions)}
            </p>
            <p className="text-xs break-all text-zinc-500">
              Then: {rule.actions.map(describeAction).join(", ")}
            </p>
            {testResult?.key === rule.id && (
              <RuleTestResults
                result={testResult.result}
                onClose={() => setTestResult(null)}
              />
            )}
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

          <RuleConditionsEditor value={conditions} onChange={setConditions} />

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
                  {action.type === "AUTO_REPLY" && (
                    <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                      <input
                        type="checkbox"
                        checked={action.replyAll === true}
                        onChange={(e) =>
                          setActions(
                            actions.map((a, j) =>
                              j === i && a.type === "AUTO_REPLY"
                                ? { ...a, replyAll: e.target.checked }
                                : a,
                            ),
                          )
                        }
                      />
                      Reply all
                    </label>
                  )}
                  {action.type === "AUTO_REPLY" && (
                    <label
                      className="flex items-center gap-1.5 text-xs text-zinc-600"
                      title="By default, a reply that draws on your uploaded documents is held for review when the sender is someone you've never corresponded with — so a crafted email can't get your documents sent to a stranger. Turn on for inboxes that answer the public from public material, like support."
                    >
                      <input
                        type="checkbox"
                        checked={action.allowUnknownSenderGrounding === true}
                        onChange={(e) =>
                          setActions(
                            actions.map((a, j) =>
                              j === i && a.type === "AUTO_REPLY"
                                ? {
                                    ...a,
                                    allowUnknownSenderGrounding:
                                      e.target.checked,
                                  }
                                : a,
                            ),
                          )
                        }
                      />
                      Auto-send document answers to new senders
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
                  {hasExtraFields(action) && (
                    <RuleActionExtraFields
                      accountId={accountId}
                      action={action}
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

          {(createMutation.isError || testMutation.isError) && (
            <p className="text-xs text-red-600">
              {(createMutation.error ?? testMutation.error) instanceof Error
                ? (createMutation.error ?? testMutation.error)?.message
                : "Could not save the rule"}
            </p>
          )}

          {testResult?.key === "form" && (
            <RuleTestResults
              result={testResult.result}
              onClose={() => setTestResult(null)}
            />
          )}

          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={createMutation.isPending}>
              Save rule
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => testMutation.mutate(undefined)}
              loading={testMutation.isPending && !testMutation.variables}
            >
              Test rule
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
