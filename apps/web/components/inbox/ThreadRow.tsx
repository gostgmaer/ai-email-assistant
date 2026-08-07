import { clsx } from "clsx";
import Link from "next/link";

import { Avatar } from "@/components/ui/Avatar";
import type { EmailThreadSummary } from "@/lib/api/types";
import {
  formatRelativeDate,
  participantListLabel,
  providerLabel,
} from "@/lib/utils/format";

export function ThreadRow({
  thread,
  active = false,
  showAccountBadge = false,
}: {
  thread: EmailThreadSummary;
  active?: boolean;
  /** Only meaningful in the unified "all accounts" view — redundant noise
   * once the list is already filtered to a single account. */
  showAccountBadge?: boolean;
}) {
  const latest = thread.messages[0];
  const unread = latest ? !latest.isRead : false;
  const isDraft = thread.folder.type === "DRAFTS";
  const href = isDraft && latest ? `/compose?draftId=${latest.id}` : `/inbox/${thread.id}`;
  // Drafts have no "from" (the user hasn't sent it yet) — show who it's
  // going to instead, same as Gmail's draft rows.
  const participants = isDraft ? latest?.to : latest?.from;
  const senderLabel = participants?.length
    ? participantListLabel(participants)
    : thread.folder.account.email;
  const priority = latest?.priority?.toLowerCase();
  const isUrgent = priority === "urgent";
  const isHighPriority = priority === "high";

  return (
    <Link
      href={href}
      className={clsx(
        "flex items-start gap-3 border-b border-zinc-100 px-3 py-3 transition-colors",
        active
          ? "bg-indigo-50"
          : unread
            ? "bg-white hover:bg-zinc-50"
            : "bg-zinc-50/60 hover:bg-zinc-100",
      )}
    >
      <Avatar label={senderLabel} size="sm" className="mt-0.5" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            {(isUrgent || isHighPriority) && (
              <span
                title={isUrgent ? "Urgent" : "High priority"}
                className={clsx(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  isUrgent ? "bg-red-500" : "bg-amber-500",
                )}
                aria-hidden="true"
              />
            )}
            <span
              className={clsx(
                "truncate text-sm",
                unread ? "font-semibold text-zinc-900" : "text-zinc-700",
              )}
            >
              {senderLabel}
            </span>
          </span>
          <span className="shrink-0 text-[11px] text-zinc-400">
            {thread.lastMessageAt && formatRelativeDate(thread.lastMessageAt)}
          </span>
        </div>
        <p
          className={clsx(
            "truncate text-sm",
            unread ? "font-medium text-zinc-900" : "text-zinc-600",
          )}
        >
          {isDraft && (
            <span className="mr-1 font-medium text-red-500">Draft ·</span>
          )}
          {thread.subject || "(no subject)"}
        </p>
        <p className="truncate text-xs text-zinc-400">
          {thread.snippet}
          {thread._count.messages > 1 && (
            <span className="ml-1.5 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
              {thread._count.messages}
            </span>
          )}
          {showAccountBadge && (
            <span
              title={`${providerLabel(thread.folder.account.provider)} · ${thread.folder.account.email}`}
              className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500"
            >
              {thread.folder.account.email.split("@")[0]}
            </span>
          )}
        </p>
      </div>

      {unread && (
        <span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-600"
          aria-hidden="true"
        />
      )}
    </Link>
  );
}
