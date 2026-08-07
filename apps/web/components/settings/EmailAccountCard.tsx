import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import type { EmailAccount } from "@/lib/api/types";
import {
  inviteAccountMember,
  listAccountMembers,
  removeAccountMember,
} from "@/lib/services/email-accounts.service";
import { providerLabel } from "@/lib/utils/format";

const STATUS_STYLE: Record<EmailAccount["syncStatus"], string> = {
  IDLE: "bg-emerald-50 text-emerald-700",
  SYNCING: "bg-amber-50 text-amber-700",
  ERROR: "bg-red-50 text-red-700",
};

// Matches the categories suggested in the classify prompt (apps/ai/app/prompts/classify.md).
// "Spam" is deliberately excluded — spam never auto-sends regardless of this list.
const CLASSIFICATION_CATEGORIES = [
  "Support",
  "Sales",
  "HR",
  "Finance",
  "Meeting",
  "Personal",
  "Marketing",
  "General",
];

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
  onUpdateAutoSend,
  onUpdateFilters,
  onUpdateAutoScheduleMeetings,
  busy,
}: {
  account: EmailAccount;
  onMakePrimary: () => void;
  onToggleSync: () => void;
  onSyncNow: () => void;
  onDisconnect: () => void;
  onUpdateAutoSend: (categories: string[]) => void;
  onUpdateFilters: (filters: Partial<Record<SyncFilterKey, boolean>>) => void;
  onUpdateAutoScheduleMeetings: (enabled: boolean) => void;
  busy: boolean;
}) {
  const [showAutoSend, setShowAutoSend] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const isOwner = account.myRole === "OWNER";

  function toggleCategory(category: string) {
    const next = account.autoSendCategories.includes(category)
      ? account.autoSendCategories.filter((c) => c !== category)
      : [...account.autoSendCategories, category];
    onUpdateAutoSend(next);
  }

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
                onClick={() => setShowAutoSend((v) => !v)}
              >
                Auto-send{" "}
                {account.autoSendCategories.length > 0
                  ? `(${account.autoSendCategories.length})`
                  : "(off)"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowFilters((v) => !v)}
              >
                Sync filters ({activeFilterCount})
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

      {showAutoSend && (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="mb-2 text-xs text-zinc-500">
            AI-drafted replies in these categories are sent automatically.
            Everything else — plus anything flagged spam or urgent — is
            always held as a draft for you to review.
          </p>
          <div className="flex flex-wrap gap-2">
            {CLASSIFICATION_CATEGORIES.map((category) => {
              const active = account.autoSendCategories.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  disabled={busy}
                  onClick={() => toggleCategory(category)}
                  className={clsx(
                    "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset disabled:cursor-not-allowed disabled:opacity-50",
                    active
                      ? "bg-indigo-600 text-white ring-indigo-600"
                      : "bg-white text-zinc-600 ring-zinc-300 hover:bg-zinc-50",
                  )}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>
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

      {showMembers && (
        <MembersPanel accountId={account.id} isOwner={isOwner} />
      )}
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
