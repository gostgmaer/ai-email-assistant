import { clsx } from "clsx";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import type { EmailAccount } from "@/lib/api/types";

const PROVIDER_LABEL: Record<EmailAccount["provider"], string> = {
  GOOGLE: "Gmail",
  MICROSOFT: "Outlook",
  IMAP: "IMAP",
};

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

export function EmailAccountCard({
  account,
  onMakePrimary,
  onToggleSync,
  onSyncNow,
  onDisconnect,
  onUpdateAutoSend,
  busy,
}: {
  account: EmailAccount;
  onMakePrimary: () => void;
  onToggleSync: () => void;
  onSyncNow: () => void;
  onDisconnect: () => void;
  onUpdateAutoSend: (categories: string[]) => void;
  busy: boolean;
}) {
  const [showAutoSend, setShowAutoSend] = useState(false);

  function toggleCategory(category: string) {
    const next = account.autoSendCategories.includes(category)
      ? account.autoSendCategories.filter((c) => c !== category)
      : [...account.autoSendCategories, category];
    onUpdateAutoSend(next);
  }

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
            {PROVIDER_LABEL[account.provider]}
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
          {!account.isPrimary && (
            <Button variant="secondary" size="sm" onClick={onMakePrimary} disabled={busy}>
              Make primary
            </Button>
          )}
          <Button variant="danger" size="sm" onClick={onDisconnect} disabled={busy}>
            Disconnect
          </Button>
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
    </div>
  );
}
