import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { HubSpotIcon, SlackIcon, TeamsIcon } from "@/components/icons";
import { AGENT_TEMPLATES } from "@/lib/agent-templates";
import type {
  AccountMember,
  Agent,
  Contact,
  EmailAccount,
  Integration,
  WorkflowAction,
  WorkflowActionType,
  WorkflowCondition,
  WorkflowConditionField,
  WorkflowConditionOperator,
} from "@/lib/api/types";
import {
  createAgent,
  deleteAgent,
  listAgents,
  updateAgent,
} from "@/lib/services/agents.service";
import {
  createContact,
  deleteContact,
  listContacts,
  updateContact,
} from "@/lib/services/contacts.service";
import {
  inviteAccountMember,
  listAccountMembers,
  removeAccountMember,
} from "@/lib/services/email-accounts.service";
import {
  connectHubspotUrl,
  connectSlackUrl,
  connectTeamsUrl,
  disconnectIntegration,
  listIntegrations,
  listSlackChannels,
  listTeamsChannels,
} from "@/lib/services/integrations.service";
import {
  createWorkflowRule,
  deleteWorkflowRule,
  listWorkflowRules,
  updateWorkflowRule,
} from "@/lib/services/workflow-rules.service";
import { formatRelativeDate, providerLabel } from "@/lib/utils/format";

const STATUS_STYLE: Record<EmailAccount["syncStatus"], string> = {
  IDLE: "bg-emerald-50 text-emerald-700",
  SYNCING: "bg-amber-50 text-amber-700",
  ERROR: "bg-red-50 text-red-700",
};

type SyncFilterKey =
  | "filterMarketing"
  | "filterOtp"
  | "filterPasswordReset"
  | "filterBilling"
  | "filterShipping"
  | "filterCalendar";

// Header-based and automated-sender detection (noreply/donotreply/etc.)
// always exclude and aren't listed here — only the subject-shape
// categories are user-configurable.
const SYNC_FILTER_CATEGORIES: { key: SyncFilterKey; label: string }[] = [
  { key: "filterMarketing", label: "Marketing" },
  { key: "filterOtp", label: "OTP codes" },
  { key: "filterPasswordReset", label: "Password reset" },
  { key: "filterBilling", label: "Billing" },
  { key: "filterShipping", label: "Shipping" },
  { key: "filterCalendar", label: "Calendar invites" },
];

export function EmailAccountCard({
  account,
  onMakePrimary,
  onToggleSync,
  onSyncNow,
  onDisconnect,
  onUpdateFilters,
  onUpdateAutoScheduleMeetings,
  onUpdateProhibitedPhrases,
  busy,
  autoExpandIntegrations,
}: {
  account: EmailAccount;
  onMakePrimary: () => void;
  onToggleSync: () => void;
  onSyncNow: () => void;
  onDisconnect: () => void;
  onUpdateFilters: (filters: Partial<Record<SyncFilterKey, boolean>>) => void;
  onUpdateAutoScheduleMeetings: (enabled: boolean) => void;
  onUpdateProhibitedPhrases: (phrases: string[]) => void;
  busy: boolean;
  autoExpandIntegrations?: boolean;
}) {
  const [showWorkflows, setShowWorkflows] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(
    () => autoExpandIntegrations ?? false,
  );
  const [showPolicy, setShowPolicy] = useState(false);
  const [policyInput, setPolicyInput] = useState(() =>
    account.prohibitedPhrases.join(", "),
  );
  const isOwner = account.myRole === "OWNER";

  function toggleFilter(key: SyncFilterKey) {
    onUpdateFilters({ [key]: !account[key] });
  }

  const activeFilterCount = SYNC_FILTER_CATEGORIES.filter(
    ({ key }) => account[key],
  ).length;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-zinc-900">
              {account.email}
            </p>
            {account.isPrimary && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                Primary
              </span>
            )}
            {!isOwner && (
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                Shared with you
              </span>
            )}
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                STATUS_STYLE[account.syncStatus],
              )}
            >
              {account.syncStatus === "IDLE" ? "synced" : account.syncStatus.toLowerCase()}
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            {providerLabel(account.provider)}
            {account.lastSyncedAt &&
              ` · last synced ${new Date(account.lastSyncedAt).toLocaleString()}`}
          </p>
          {account.lastSyncError && (
            <p className="mt-1 text-xs text-red-600">{account.lastSyncError}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onSyncNow} disabled={busy}>
            Sync now
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowMembers((v) => !v)}
          >
            Members
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowContacts((v) => !v)}
          >
            Contacts
          </Button>
          {isOwner && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={onToggleSync}
                disabled={busy}
              >
                {account.syncEnabled ? "Pause sync" : "Resume sync"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowWorkflows((v) => !v)}
              >
                Workflows
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAgents((v) => !v)}
              >
                Agents
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowIntegrations((v) => !v)}
              >
                Integrations
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowFilters((v) => !v)}
              >
                Sync filters ({activeFilterCount})
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowPolicy((v) => !v)}
              >
                Policy ({account.prohibitedPhrases.length})
              </Button>
              <Button
                variant={account.autoScheduleMeetings ? "primary" : "secondary"}
                size="sm"
                disabled={busy}
                onClick={() =>
                  onUpdateAutoScheduleMeetings(!account.autoScheduleMeetings)
                }
              >
                Auto-schedule meetings{" "}
                {account.autoScheduleMeetings ? "(on)" : "(off)"}
              </Button>
              {!account.isPrimary && (
                <Button variant="secondary" size="sm" onClick={onMakePrimary} disabled={busy}>
                  Make primary
                </Button>
              )}
              <Button variant="danger" size="sm" onClick={onDisconnect} disabled={busy}>
                Disconnect
              </Button>
            </>
          )}
        </div>
      </div>

      {showWorkflows && (
        <WorkflowRulesPanel accountId={account.id} isOwner={isOwner} />
      )}

      {showAgents && <AgentsPanel accountId={account.id} isOwner={isOwner} />}

      {showIntegrations && (
        <IntegrationsPanel accountId={account.id} isOwner={isOwner} />
      )}

      {showFilters && (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="mb-2 text-xs text-zinc-500">
            Highlighted categories are excluded from sync entirely — they
            never appear in your inbox and never reach the AI pipeline.
            Click to let a category sync anyway. A message that&apos;s part
            of a real conversation always syncs regardless of these
            settings.
          </p>
          <div className="flex flex-wrap gap-2">
            {SYNC_FILTER_CATEGORIES.map(({ key, label }) => {
              const active = account[key];
              return (
                <button
                  key={key}
                  type="button"
                  disabled={busy}
                  onClick={() => toggleFilter(key)}
                  className={clsx(
                    "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset disabled:cursor-not-allowed disabled:opacity-50",
                    active
                      ? "bg-indigo-600 text-white ring-indigo-600"
                      : "bg-white text-zinc-600 ring-zinc-300 hover:bg-zinc-50",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showPolicy && (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="mb-2 text-xs text-zinc-500">
            Case-insensitive phrases that block an AI reply from auto-sending
            if present (e.g. &quot;refund&quot;, &quot;guarantee&quot;) — held
            for review instead. Empty by default; nothing is pre-populated,
            since this account defines its own policy.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Comma-separated, e.g. refund, guarantee, discount"
              value={policyInput}
              onChange={(e) => setPolicyInput(e.target.value)}
              className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
            />
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                onUpdateProhibitedPhrases(
                  policyInput
                    .split(",")
                    .map((phrase) => phrase.trim())
                    .filter(Boolean),
                )
              }
            >
              Save
            </Button>
          </div>
        </div>
      )}

      {showMembers && (
        <MembersPanel accountId={account.id} isOwner={isOwner} />
      )}

      {showContacts && <ContactsPanel accountId={account.id} />}
    </div>
  );
}

function MembersPanel({
  accountId,
  isOwner,
}: {
  accountId: string;
  isOwner: boolean;
}) {
  const [email, setEmail] = useState("");
  const queryClient = useQueryClient();

  const { data: members, isLoading } = useQuery({
    queryKey: ["account-members", accountId],
    queryFn: () => listAccountMembers(accountId),
  });

  function invalidate() {
    return queryClient.invalidateQueries({
      queryKey: ["account-members", accountId],
    });
  }

  const inviteMutation = useMutation({
    mutationFn: (inviteeEmail: string) =>
      inviteAccountMember(accountId, inviteeEmail),
    onSuccess: () => {
      setEmail("");
      void invalidate();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeAccountMember(accountId, userId),
    onSuccess: () => void invalidate(),
  });

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <p className="mb-2 text-xs text-zinc-500">
        Everyone listed here can view and reply from this account&apos;s
        shared inbox.
        {isOwner
          ? " Invite an existing user by the email they signed up with."
          : " Only the owner can invite or remove people."}
      </p>

      {isOwner && (
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) inviteMutation.mutate(email.trim());
          }}
        >
          <input
            type="email"
            required
            placeholder="teammate@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full max-w-xs rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          />
          <Button type="submit" size="sm" loading={inviteMutation.isPending}>
            Invite
          </Button>
        </form>
      )}

      {inviteMutation.isError && (
        <p className="mb-2 text-xs text-red-600">
          {inviteMutation.error instanceof Error
            ? inviteMutation.error.message
            : "Could not invite that user"}
        </p>
      )}

      {isLoading && <p className="text-xs text-zinc-400">Loading members…</p>}

      <ul className="divide-y divide-zinc-100">
        {members?.map((member) => (
          <li
            key={member.id}
            className="flex items-center justify-between py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-900">
                {member.user.displayName ?? member.user.email}
              </p>
              <p className="text-xs text-zinc-500">
                {member.user.email} ·{" "}
                {member.role === "OWNER" ? "Owner" : "Member"}
              </p>
            </div>
            {isOwner && member.role !== "OWNER" && (
              <Button
                variant="ghost"
                size="sm"
                loading={
                  removeMutation.isPending &&
                  removeMutation.variables === member.userId
                }
                onClick={() => removeMutation.mutate(member.userId)}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

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

function WorkflowRulesPanel({
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
        return agent ? `Auto-send reply as "${agent.name}"` : "Auto-send reply";
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

type PostToSlackAction = Extract<WorkflowAction, { type: "POST_TO_SLACK" }>;

function SlackActionFields({
  action,
  integrations,
  onChange,
}: {
  action: PostToSlackAction;
  integrations: Integration[] | undefined;
  onChange: (next: PostToSlackAction) => void;
}) {
  const slackIntegrations = integrations?.filter((i) => i.provider === "SLACK");

  const { data: channels, isLoading } = useQuery({
    queryKey: ["integration-channels", action.integrationId],
    queryFn: () => listSlackChannels(action.integrationId),
    enabled: !!action.integrationId,
  });

  return (
    <>
      <select
        value={action.integrationId}
        onChange={(e) =>
          onChange({ ...action, integrationId: e.target.value, channelId: "" })
        }
        className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
      >
        <option value="">
          {slackIntegrations?.length ? "Select workspace" : "No workspace connected"}
        </option>
        {slackIntegrations?.map((integration) => (
          <option key={integration.id} value={integration.id}>
            {integration.workspaceName ?? "Slack"}
          </option>
        ))}
      </select>
      {action.integrationId && (
        <select
          value={action.channelId}
          disabled={isLoading}
          onChange={(e) => onChange({ ...action, channelId: e.target.value })}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50"
        >
          <option value="">
            {isLoading ? "Loading channels…" : "Select channel"}
          </option>
          {channels?.map((channel) => (
            <option key={channel.id} value={channel.id}>
              #{channel.name}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

type PostToTeamsAction = Extract<WorkflowAction, { type: "POST_TO_TEAMS" }>;

/** Two-level team → channel picker — Teams doesn't have Slack's flat
 * channel list, so listTeamsChannels returns one row per (team, channel)
 * pair and this groups them by team for the first select. */
function TeamsActionFields({
  action,
  integrations,
  onChange,
}: {
  action: PostToTeamsAction;
  integrations: Integration[] | undefined;
  onChange: (next: PostToTeamsAction) => void;
}) {
  const teamsIntegrations = integrations?.filter((i) => i.provider === "TEAMS");

  const { data: channels, isLoading } = useQuery({
    queryKey: ["integration-teams-channels", action.integrationId],
    queryFn: () => listTeamsChannels(action.integrationId),
    enabled: !!action.integrationId,
  });

  const teams = Array.from(
    new Map(channels?.map((c) => [c.teamId, c.teamName])).entries(),
  );
  const channelsForTeam = channels?.filter((c) => c.teamId === action.teamId);

  return (
    <>
      <select
        value={action.integrationId}
        onChange={(e) =>
          onChange({
            ...action,
            integrationId: e.target.value,
            teamId: "",
            channelId: "",
          })
        }
        className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
      >
        <option value="">
          {teamsIntegrations?.length ? "Select tenant" : "No tenant connected"}
        </option>
        {teamsIntegrations?.map((integration) => (
          <option key={integration.id} value={integration.id}>
            {integration.workspaceName ?? "Microsoft Teams"}
          </option>
        ))}
      </select>
      {action.integrationId && (
        <select
          value={action.teamId}
          disabled={isLoading}
          onChange={(e) =>
            onChange({ ...action, teamId: e.target.value, channelId: "" })
          }
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50"
        >
          <option value="">{isLoading ? "Loading teams…" : "Select team"}</option>
          {teams.map(([teamId, teamName]) => (
            <option key={teamId} value={teamId}>
              {teamName}
            </option>
          ))}
        </select>
      )}
      {action.teamId && (
        <select
          value={action.channelId}
          onChange={(e) => onChange({ ...action, channelId: e.target.value })}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
        >
          <option value="">Select channel</option>
          {channelsForTeam?.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

type CreateHubspotContactAction = Extract<
  WorkflowAction,
  { type: "CREATE_HUBSPOT_CONTACT" }
>;

/** Only needs an integration picker — the contact synced is always the
 * matched message's own sender, not a user-chosen value. */
function HubspotActionFields({
  action,
  integrations,
  onChange,
}: {
  action: CreateHubspotContactAction;
  integrations: Integration[] | undefined;
  onChange: (next: CreateHubspotContactAction) => void;
}) {
  const hubspotIntegrations = integrations?.filter(
    (i) => i.provider === "HUBSPOT",
  );

  return (
    <select
      value={action.integrationId}
      onChange={(e) => onChange({ ...action, integrationId: e.target.value })}
      className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
    >
      <option value="">
        {hubspotIntegrations?.length ? "Select portal" : "No portal connected"}
      </option>
      {hubspotIntegrations?.map((integration) => (
        <option key={integration.id} value={integration.id}>
          {integration.workspaceName ?? "HubSpot"}
        </option>
      ))}
    </select>
  );
}

type ApprovalChainAction = Extract<
  WorkflowAction,
  { type: "REQUIRE_APPROVAL_CHAIN" }
>;

/** Ordered approver picker — order matters here (unlike Slack's channel
 * picker), since REQUIRE_APPROVAL_CHAIN's approverUserIds sign off in
 * sequence, not all at once. */
function ApprovalChainActionFields({
  action,
  members,
  onChange,
}: {
  action: ApprovalChainAction;
  members: AccountMember[] | undefined;
  onChange: (next: ApprovalChainAction) => void;
}) {
  const available = members?.filter(
    (m) => !action.approverUserIds.includes(m.userId),
  );

  function memberLabel(userId: string) {
    const member = members?.find((m) => m.userId === userId);
    return member ? (member.user.displayName ?? member.user.email) : userId;
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...action.approverUserIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...action, approverUserIds: next });
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      {action.approverUserIds.length > 0 && (
        <ol className="flex flex-col gap-1">
          {action.approverUserIds.map((userId, index) => (
            <li
              key={userId}
              className="flex items-center gap-1.5 rounded-md bg-zinc-50 px-2 py-1 text-xs"
            >
              <span className="font-medium text-zinc-500">{index + 1}.</span>
              <span className="flex-1">{memberLabel(userId)}</span>
              <button
                type="button"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === action.approverUserIds.length - 1}
                onClick={() => move(index, 1)}
                className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...action,
                    approverUserIds: action.approverUserIds.filter(
                      (id) => id !== userId,
                    ),
                  })
                }
                className="text-zinc-400 hover:text-red-600"
                aria-label="Remove approver"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
      {available && available.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            onChange({
              ...action,
              approverUserIds: [...action.approverUserIds, e.target.value],
            });
          }}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
        >
          <option value="">+ Add approver</option>
          {available.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.user.displayName ?? m.user.email}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

const INTEGRATION_LABEL: Record<Integration["provider"], string> = {
  SLACK: "Slack",
  TEAMS: "Microsoft Teams",
  HUBSPOT: "HubSpot",
};

function IntegrationProviderIcon({ provider }: { provider: Integration["provider"] }) {
  switch (provider) {
    case "SLACK":
      return <SlackIcon />;
    case "TEAMS":
      return <TeamsIcon />;
    case "HUBSPOT":
      return <HubSpotIcon />;
  }
}

function IntegrationsPanel({
  accountId,
  isOwner,
}: {
  accountId: string;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();

  const { data: integrations, isLoading } = useQuery({
    queryKey: ["integrations", accountId],
    queryFn: () => listIntegrations(accountId),
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectIntegration,
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["integrations", accountId],
      }),
  });

  const connected = new Set(integrations?.map((i) => i.provider));

  const CONNECT_OPTIONS: {
    provider: Integration["provider"];
    label: string;
    href: string;
  }[] = [
    { provider: "SLACK", label: "Connect Slack", href: connectSlackUrl(accountId) },
    { provider: "TEAMS", label: "Connect Teams", href: connectTeamsUrl(accountId) },
    {
      provider: "HUBSPOT",
      label: "Connect HubSpot",
      href: connectHubspotUrl(accountId),
    },
  ];

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <p className="mb-2 text-xs text-zinc-500">
        Connect a workspace/tenant/portal here, then reference it from a
        workflow action above — post to a Slack or Teams channel, or sync
        the sender to HubSpot, whenever a rule matches.
      </p>

      {isLoading && (
        <p className="text-xs text-zinc-400">Loading integrations…</p>
      )}

      <ul className="mb-3 space-y-2">
        {integrations?.map((integration) => (
          <li
            key={integration.id}
            className="flex items-center justify-between rounded-md border border-zinc-200 p-3"
          >
            <div className="flex items-center gap-2">
              <IntegrationProviderIcon provider={integration.provider} />
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  {integration.workspaceName ??
                    INTEGRATION_LABEL[integration.provider]}
                </p>
                <p className="text-xs text-zinc-500">
                  {INTEGRATION_LABEL[integration.provider]}
                </p>
              </div>
            </div>
            {isOwner && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => disconnectMutation.mutate(integration.id)}
                loading={
                  disconnectMutation.isPending &&
                  disconnectMutation.variables === integration.id
                }
              >
                Disconnect
              </Button>
            )}
          </li>
        ))}
        {integrations?.length === 0 && !isLoading && (
          <li className="text-xs text-zinc-400">No integrations connected yet.</li>
        )}
      </ul>

      {isOwner && (
        <div className="flex flex-wrap gap-2">
          {CONNECT_OPTIONS.filter((o) => !connected.has(o.provider)).map(
            (option) => (
              <a
                key={option.provider}
                href={option.href}
                className="flex w-fit items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
              >
                <IntegrationProviderIcon provider={option.provider} />
                {option.label}
              </a>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function AgentsPanel({
  accountId,
  isOwner,
}: {
  accountId: string;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");

  const { data: agents, isLoading } = useQuery({
    queryKey: ["agents", accountId],
    queryFn: () => listAgents(accountId),
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ["agents", accountId] });
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setSystemPrompt("");
    setShowForm(false);
  }

  const createMutation = useMutation({
    mutationFn: () => createAgent(accountId, { name, systemPrompt }),
    onSuccess: () => {
      resetForm();
      void invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateAgent(accountId, editingId!, { name, systemPrompt }),
    onSuccess: () => {
      resetForm();
      void invalidate();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ agentId, enabled }: { agentId: string; enabled: boolean }) =>
      updateAgent(accountId, agentId, { enabled }),
    onSuccess: () => void invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: (agentId: string) => deleteAgent(accountId, agentId),
    onSuccess: () => void invalidate(),
  });

  function startEdit(agent: Agent) {
    setEditingId(agent.id);
    setName(agent.name);
    setSystemPrompt(agent.systemPrompt);
    setShowForm(true);
  }

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <p className="mb-2 text-xs text-zinc-500">
        A persona&apos;s system prompt fully replaces the default reply
        prompt when used — attach one to a workflow rule&apos;s
        &quot;Auto-send the AI reply&quot; action.
      </p>

      {isLoading && <p className="text-xs text-zinc-400">Loading agents…</p>}

      <ul className="mb-3 space-y-2">
        {agents?.map((agent) => (
          <li key={agent.id} className="rounded-md border border-zinc-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-zinc-900">{agent.name}</p>
              {isOwner && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      toggleMutation.mutate({
                        agentId: agent.id,
                        enabled: !agent.enabled,
                      })
                    }
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                      agent.enabled
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-zinc-100 text-zinc-500 ring-zinc-200",
                    )}
                  >
                    {agent.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <Button variant="ghost" size="sm" onClick={() => startEdit(agent)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(agent.id)}
                    loading={
                      deleteMutation.isPending &&
                      deleteMutation.variables === agent.id
                    }
                  >
                    Delete
                  </Button>
                </div>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
              {agent.systemPrompt}
            </p>
          </li>
        ))}
        {agents?.length === 0 && !isLoading && (
          <li className="text-xs text-zinc-400">No agent personas yet.</li>
        )}
      </ul>

      {isOwner && !showForm && (
        <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
          + Add agent
        </Button>
      )}

      {isOwner && showForm && (
        <form
          className="space-y-3 rounded-md border border-zinc-200 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (editingId) updateMutation.mutate();
            else createMutation.mutate();
          }}
        >
          {!editingId && (
            <div>
              <p className="mb-1 text-xs font-medium text-zinc-600">
                Start from a template (optional):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {AGENT_TEMPLATES.map((template) => (
                  <button
                    key={template.name}
                    type="button"
                    onClick={() => {
                      setName(template.name);
                      setSystemPrompt(template.systemPrompt);
                    }}
                    className="rounded-full px-3 py-1 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <input
            type="text"
            required
            placeholder='Persona name, e.g. "Customer Support Agent"'
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          />
          <textarea
            required
            rows={5}
            placeholder="Write the complete system prompt for how this persona should reply — this replaces the default prompt entirely, not appended to it."
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          />

          {(createMutation.isError || updateMutation.isError) && (
            <p className="text-xs text-red-600">
              {(createMutation.error ?? updateMutation.error) instanceof Error
                ? ((createMutation.error ?? updateMutation.error) as Error)
                    .message
                : "Could not save that agent"}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {editingId ? "Save changes" : "Create agent"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function ContactsPanel({ accountId }: { accountId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  const { data: contacts, isLoading } = useQuery({
    queryKey: ["contacts", accountId],
    queryFn: () => listContacts(accountId),
  });

  function invalidate() {
    return queryClient.invalidateQueries({
      queryKey: ["contacts", accountId],
    });
  }

  function resetForm() {
    setEditingId(null);
    setEmail("");
    setName("");
    setCompany("");
    setPhone("");
    setStatus("");
    setNotes("");
    setTagsInput("");
    setShowForm(false);
  }

  function tagsFromInput(): string[] {
    return tagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createContact(accountId, {
        email,
        name: name || undefined,
        company: company || undefined,
        phone: phone || undefined,
        status: status || undefined,
        notes: notes || undefined,
        tags: tagsFromInput(),
      }),
    onSuccess: () => {
      resetForm();
      void invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateContact(accountId, editingId!, {
        name: name || undefined,
        company: company || undefined,
        phone: phone || undefined,
        status: status || undefined,
        notes: notes || undefined,
        tags: tagsFromInput(),
      }),
    onSuccess: () => {
      resetForm();
      void invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (contactId: string) => deleteContact(accountId, contactId),
    onSuccess: () => void invalidate(),
  });

  function startEdit(contact: Contact) {
    setEditingId(contact.id);
    setEmail(contact.email);
    setName(contact.name ?? "");
    setCompany(contact.company ?? "");
    setPhone(contact.phone ?? "");
    setStatus(contact.status ?? "");
    setNotes(contact.notes ?? "");
    setTagsInput(contact.tags.join(", "));
    setShowForm(true);
  }

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <p className="mb-2 text-xs text-zinc-500">
        Contacts are created explicitly here — they&apos;re never
        auto-populated from incoming email. Once created,{" "}
        <span className="font-medium">last contacted</span> updates
        automatically whenever this account processes a message from that
        address.
      </p>

      {isLoading && <p className="text-xs text-zinc-400">Loading contacts…</p>}

      <ul className="mb-3 space-y-2">
        {contacts?.map((contact) => (
          <li
            key={contact.id}
            className="rounded-md border border-zinc-200 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  {contact.name || contact.email}
                  {contact.status && (
                    <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200">
                      {contact.status}
                    </span>
                  )}
                </p>
                <p className="text-xs text-zinc-500">
                  {contact.email}
                  {contact.company && ` · ${contact.company}`}
                  {contact.phone && ` · ${contact.phone}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => startEdit(contact)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate(contact.id)}
                  loading={
                    deleteMutation.isPending &&
                    deleteMutation.variables === contact.id
                  }
                >
                  Delete
                </Button>
              </div>
            </div>
            {contact.notes && (
              <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                {contact.notes}
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {contact.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200"
                >
                  {tag}
                </span>
              ))}
              {contact.lastContactedAt && (
                <span className="text-[10px] text-zinc-400">
                  Last contacted {formatRelativeDate(contact.lastContactedAt)}
                </span>
              )}
            </div>
          </li>
        ))}
        {contacts?.length === 0 && !isLoading && (
          <li className="text-xs text-zinc-400">No contacts yet.</li>
        )}
      </ul>

      {!showForm && (
        <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
          + Add contact
        </Button>
      )}

      {showForm && (
        <form
          className="space-y-3 rounded-md border border-zinc-200 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (editingId) updateMutation.mutate();
            else createMutation.mutate();
          }}
        >
          <input
            type="email"
            required
            disabled={!!editingId}
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:bg-zinc-50 disabled:text-zinc-400"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
            />
            <input
              type="text"
              placeholder="Company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
            />
            <input
              type="text"
              placeholder="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
            />
            <input
              type="text"
              placeholder='Status, e.g. "Lead"'
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
            />
          </div>
          <input
            type="text"
            placeholder="Tags, comma-separated"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          />
          <textarea
            rows={3}
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          />

          {(createMutation.isError || updateMutation.isError) && (
            <p className="text-xs text-red-600">
              {(createMutation.error ?? updateMutation.error) instanceof Error
                ? ((createMutation.error ?? updateMutation.error) as Error)
                    .message
                : "Could not save that contact"}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {editingId ? "Save changes" : "Create contact"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
