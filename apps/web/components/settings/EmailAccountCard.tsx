import { clsx } from "clsx";

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

export function EmailAccountCard({
  account,
  onMakePrimary,
  onToggleSync,
  onSyncNow,
  onDisconnect,
  busy,
}: {
  account: EmailAccount;
  onMakePrimary: () => void;
  onToggleSync: () => void;
  onSyncNow: () => void;
  onDisconnect: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
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
  );
}
