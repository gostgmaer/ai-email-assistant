import { clsx } from "clsx";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import type { EmailAccount } from "@/lib/api/types";
import {
  connectGoogleUrl,
  connectMicrosoftUrl,
} from "@/lib/services/email-accounts.service";
import { providerLabel } from "@/lib/utils/format";

import { AgentsPanel } from "./AgentsPanel";
import { AutomationLogPanel } from "./AutomationLogPanel";
import { AutomationSettingsPanel } from "./AutomationSettingsPanel";
import { ContactsPanel } from "./ContactsPanel";
import { IntegrationsPanel } from "./IntegrationsPanel";
import { MembersPanel } from "./MembersPanel";
import { WorkflowRulesPanel } from "./WorkflowRulesPanel";
import { WritingStylePanel } from "./WritingStylePanel";

const STATUS_STYLE: Record<EmailAccount["syncStatus"], string> = {
  IDLE: "bg-emerald-50 text-emerald-700",
  SYNCING: "bg-amber-50 text-amber-700",
  ERROR: "bg-red-50 text-red-700",
  AUTH_REQUIRED: "bg-red-50 text-red-700",
};

const STATUS_LABEL: Record<EmailAccount["syncStatus"], string> = {
  IDLE: "synced",
  SYNCING: "syncing",
  ERROR: "error",
  AUTH_REQUIRED: "reconnect needed",
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
  onUpdateFilters: (
    filters: Partial<Record<SyncFilterKey | "keepNewsletters", boolean>>,
  ) => void;
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
  const [showStyle, setShowStyle] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(
    () => autoExpandIntegrations ?? false,
  );
  const [showPolicy, setShowPolicy] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
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
              {STATUS_LABEL[account.syncStatus]}
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            {providerLabel(account.provider)}
            {account.lastSyncedAt &&
              ` · last synced ${new Date(account.lastSyncedAt).toLocaleString()}`}
          </p>
          {account.syncStatus === "AUTH_REQUIRED" ? (
            <p className="mt-1 text-xs text-red-600">
              This mailbox stopped syncing because its sign-in is no longer
              valid.{" "}
              {account.provider === "IMAP" ? (
                "Disconnect it and connect it again with the current password."
              ) : (
                <a
                  href={
                    account.provider === "GOOGLE"
                      ? connectGoogleUrl()
                      : connectMicrosoftUrl()
                  }
                  className="font-medium underline hover:text-red-500"
                >
                  Reconnect
                </a>
              )}
            </p>
          ) : (
            account.lastSyncError && (
              <p className="mt-1 text-xs text-red-600">
                {account.lastSyncError}
              </p>
            )
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowStyle((v) => !v)}
          >
            Writing style
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
                onClick={() => setShowAutomation((v) => !v)}
              >
                Automation{account.autoSendEnabled ? "" : " (auto-send off)"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowActivity((v) => !v)}
              >
                Activity
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

      {showAutomation && isOwner && <AutomationSettingsPanel account={account} />}

      {showActivity && isOwner && <AutomationLogPanel accountId={account.id} />}

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
          <label className="mt-3 flex items-start gap-2 text-xs text-zinc-600">
            <input
              type="checkbox"
              checked={account.keepNewsletters}
              disabled={busy}
              onChange={() =>
                onUpdateFilters({ keepNewsletters: !account.keepNewsletters })
              }
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-zinc-800">
                Keep newsletters
              </span>{" "}
              — instead of dropping mailing-list and marketing mail, put it
              under Inbox → Newsletters, where you can unsubscribe or clean
              it up. The AI never replies to it. Applies to mail that arrives
              from now on.
            </span>
          </label>
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

      {showStyle && (
        <WritingStylePanel accountId={account.id} isOwner={isOwner} />
      )}
    </div>
  );
}
