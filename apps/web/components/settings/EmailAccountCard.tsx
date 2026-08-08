import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { AGENT_TEMPLATES } from "@/lib/agent-templates";
import type {
  Agent,
  Contact,
  EmailAccount,
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
}) {
  const [showWorkflows, setShowWorkflows] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
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
  { value: "REQUIRE_APPROVAL", label: "Hold as draft (no auto-reply)" },
];

function emptyCondition(): WorkflowCondition {
  return { field: "category", operator: "equals", value: "" };
}

function emptyAction(): WorkflowAction {
  return { type: "AUTO_REPLY" };
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
      case "REQUIRE_APPROVAL":
        return "Hold as draft";
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
                      const next: WorkflowAction =
                        type === "ASSIGN_TO" || type === "NOTIFY"
                          ? { type, userId: members?.[0]?.userId ?? "" }
                          : { type };
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
