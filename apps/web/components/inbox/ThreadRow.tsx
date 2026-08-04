import { clsx } from "clsx";
import Link from "next/link";

import type { EmailThreadSummary } from "@/lib/api/types";
import {
  formatRelativeDate,
  participantListLabel,
} from "@/lib/utils/format";

export function ThreadRow({ thread }: { thread: EmailThreadSummary }) {
  const latest = thread.messages[0];
  const unread = latest ? !latest.isRead : false;
  const isDraft = thread.folder.type === "DRAFTS";
  const href = isDraft && latest ? `/compose?draftId=${latest.id}` : `/inbox/${thread.id}`;

  return (
    <Link
      href={href}
      className={clsx(
        "flex items-center gap-4 border-b border-zinc-100 px-4 py-3 hover:bg-zinc-50",
        unread && "bg-white",
      )}
    >
      <div className="w-40 shrink-0 truncate text-sm">
        <span className={unread ? "font-semibold text-zinc-900" : "text-zinc-600"}>
          {latest ? participantListLabel(latest.from) : thread.folder.account.email}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={clsx(
            "truncate text-sm",
            unread ? "font-semibold text-zinc-900" : "text-zinc-700",
          )}
        >
          {thread.subject || "(no subject)"}
          {thread.snippet && (
            <span className="ml-2 font-normal text-zinc-400">
              — {thread.snippet}
            </span>
          )}
        </p>
      </div>
      {thread._count.messages > 1 && (
        <span className="shrink-0 text-xs text-zinc-400">
          {thread._count.messages}
        </span>
      )}
      <div className="w-16 shrink-0 text-right text-xs text-zinc-400">
        {thread.lastMessageAt && formatRelativeDate(thread.lastMessageAt)}
      </div>
    </Link>
  );
}
