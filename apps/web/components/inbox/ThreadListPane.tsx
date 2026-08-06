"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ThreadListSkeleton } from "@/components/inbox/ThreadListSkeleton";
import { ThreadRow } from "@/components/inbox/ThreadRow";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import {
  ArchiveIcon,
  DraftIcon,
  InboxIcon,
  SendIcon,
  SpamIcon,
  TrashIcon,
} from "@/components/icons";
import type { MailFolderType } from "@/lib/api/types";
import { listEmailAccounts } from "@/lib/services/email-accounts.service";
import { listThreads } from "@/lib/services/email.service";

const FOLDER_TABS: { type: MailFolderType; label: string; icon: typeof InboxIcon }[] = [
  { type: "INBOX", label: "Inbox", icon: InboxIcon },
  { type: "SENT", label: "Sent", icon: SendIcon },
  { type: "DRAFTS", label: "Drafts", icon: DraftIcon },
  { type: "ARCHIVE", label: "Archive", icon: ArchiveIcon },
  { type: "SPAM", label: "Spam", icon: SpamIcon },
  { type: "TRASH", label: "Trash", icon: TrashIcon },
];

const FOLDER_TYPE_VALUES = FOLDER_TABS.map((tab) => tab.type);

function isFolderType(value: string | null): value is MailFolderType {
  return FOLDER_TYPE_VALUES.includes(value as MailFolderType);
}

export function ThreadListPane() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const q = searchParams.get("q") ?? "";
  const folderTypeParam = searchParams.get("folderType");
  const folderType = isFolderType(folderTypeParam) ? folderTypeParam : "INBOX";
  const accountId = searchParams.get("accountId") ?? undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  // The active thread, if any — highlighted in the list and used to keep
  // the reading pane's selection visible while switching folders.
  const activeThreadId = pathname.match(/^\/inbox\/([^/]+)/)?.[1];

  function updateParams(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
    }
    router.push(`/inbox?${next.toString()}`);
  }

  const { data: accounts } = useQuery({
    queryKey: ["email-accounts"],
    queryFn: listEmailAccounts,
  });

  const {
    data: threadsPage,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["threads", { folderType, accountId, q, page }],
    queryFn: () =>
      listThreads({ folderType, accountId, q: q || undefined, page, limit: 25 }),
    placeholderData: (previous) => previous,
  });

  return (
    <div className="flex h-full w-full flex-col border-r border-zinc-200 bg-white lg:w-95 lg:shrink-0">
      <div className="shrink-0 space-y-2 border-b border-zinc-200 p-3">
        <div className="flex gap-1 overflow-x-auto">
          {FOLDER_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = folderType === tab.type;
            return (
              <button
                key={tab.type}
                type="button"
                onClick={() =>
                  updateParams({ folderType: tab.type, page: undefined })
                }
                className={clsx(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                  active
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {accounts && accounts.length > 1 && (
          <select
            value={accountId ?? ""}
            onChange={(event) =>
              updateParams({
                accountId: event.target.value || undefined,
                page: undefined,
              })
            }
            className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600"
            aria-label="Filter by account"
          >
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.email}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading && <ThreadListSkeleton />}

      {isError && (
        <ErrorState
          message={error instanceof Error ? error.message : "Failed to load threads"}
        />
      )}

      {!isLoading && !isError && threadsPage?.threads.length === 0 && (
        <EmptyState
          title="No emails here"
          description={
            q
              ? `No results for "${q}" in ${folderType.toLowerCase()}.`
              : `Nothing in ${folderType.toLowerCase()} yet.`
          }
        />
      )}

      {!isLoading && threadsPage && threadsPage.threads.length > 0 && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {threadsPage.threads.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                active={thread.id === activeThreadId}
              />
            ))}
          </div>

          {threadsPage.totalPages > 1 && (
            <div className="flex shrink-0 items-center justify-between border-t border-zinc-200 px-3 py-2">
              <span className="text-xs text-zinc-500">
                {threadsPage.page}/{threadsPage.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() =>
                    updateParams({ page: String(Math.max(1, page - 1)) })
                  }
                >
                  Prev
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= threadsPage.totalPages}
                  onClick={() => updateParams({ page: String(page + 1) })}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
