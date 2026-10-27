"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { NewsletterCleanup } from "@/components/inbox/NewsletterCleanup";
import { ThreadListSkeleton } from "@/components/inbox/ThreadListSkeleton";
import { ThreadRow } from "@/components/inbox/ThreadRow";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import {
  ArchiveIcon,
  ClockIcon,
  DraftIcon,
  InboxIcon,
  SendIcon,
  SpamIcon,
  TrashIcon,
} from "@/components/icons";
import type { MailFolderType, ThreadTriage } from "@/lib/api/types";
import { listEmailAccounts } from "@/lib/services/email-accounts.service";
import { getTriageCounts, listThreads } from "@/lib/services/email.service";

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

// Smart triage groups within the Inbox (EmailThread.triage).
const TRIAGE_TABS: { value: ThreadTriage; label: string }[] = [
  { value: "NEEDS_REPLY", label: "Needs reply" },
  { value: "FYI", label: "FYI" },
  { value: "NOTIFICATION", label: "Notifications" },
  { value: "NEWSLETTER", label: "Newsletters" },
];

function isTriage(value: string | null): value is ThreadTriage {
  return TRIAGE_TABS.some((tab) => tab.value === value);
}

const TRIAGE_EMPTY: Record<ThreadTriage, string> = {
  NEEDS_REPLY: "Nothing is waiting for your reply.",
  FYI: "No FYI mail right now.",
  NOTIFICATION: "No notifications right now.",
  NEWSLETTER:
    "No newsletters. They're dropped at sync unless an account keeps them (Settings → Sync filters).",
};

export function ThreadListPane() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const q = searchParams.get("q") ?? "";
  const folderTypeParam = searchParams.get("folderType");
  const snoozedParam = searchParams.get("snoozed") === "true";
  // The Snoozed view lists snoozed threads from every folder, so it carries
  // no folder of its own (see InboxService.listThreads).
  const folderType = isFolderType(folderTypeParam)
    ? folderTypeParam
    : snoozedParam
      ? undefined
      : "INBOX";
  const accountId = searchParams.get("accountId") ?? undefined;
  const priority = searchParams.get("priority") ?? undefined;
  const snoozed = snoozedParam;
  // Triage groups only split the Inbox itself.
  const inInbox = folderType === "INBOX" && !snoozed;
  const triageParam = searchParams.get("triage");
  const triage = inInbox && isTriage(triageParam) ? triageParam : undefined;
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
    queryKey: [
      "threads",
      { folderType, accountId, priority, triage, snoozed, q, page },
    ],
    queryFn: () =>
      listThreads({
        folderType,
        accountId,
        priority,
        triage,
        snoozed,
        q: q || undefined,
        page,
        limit: 25,
      }),
    placeholderData: (previous) => previous,
  });

  const { data: triageCounts } = useQuery({
    queryKey: ["triage-counts", accountId],
    queryFn: () => getTriageCounts(accountId),
    enabled: inInbox,
  });
  // Newsletters only exist for accounts that keep them; don't show an
  // always-empty group to everyone else.
  const showNewsletters =
    triage === "NEWSLETTER" ||
    (triageCounts?.NEWSLETTER ?? 0) > 0 ||
    (accounts ?? []).some((account) => account.keepNewsletters);
  const triageTabs = TRIAGE_TABS.filter(
    (tab) => tab.value !== "NEWSLETTER" || showNewsletters,
  );

  return (
    <div className="flex h-full w-full flex-col border-r border-zinc-200 bg-white lg:w-95 lg:shrink-0">
      <div className="shrink-0 space-y-2 border-b border-zinc-200 p-3">
        <div className="flex gap-1 overflow-x-auto">
          {FOLDER_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = !snoozed && folderType === tab.type;
            return (
              <button
                key={tab.type}
                type="button"
                onClick={() =>
                  updateParams({
                    folderType: tab.type,
                    snoozed: undefined,
                    triage: undefined,
                    page: undefined,
                  })
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
          <button
            type="button"
            onClick={() =>
              updateParams({
                snoozed: snoozed ? undefined : "true",
                folderType: undefined,
                page: undefined,
              })
            }
            className={clsx(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
              snoozed
                ? "bg-indigo-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
            )}
          >
            <ClockIcon className="h-3.5 w-3.5" />
            Snoozed
          </button>
        </div>

        {inInbox && (
          <div
            className="flex gap-1 overflow-x-auto"
            role="group"
            aria-label="Inbox groups"
          >
            {[{ value: undefined, label: "All" }, ...triageTabs].map((tab) => {
              const active = triage === tab.value;
              const count = triageCounts?.[tab.value ?? "all"];
              return (
                <button
                  key={tab.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    updateParams({ triage: tab.value, page: undefined })
                  }
                  className={clsx(
                    "flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs whitespace-nowrap transition-colors",
                    active
                      ? "bg-indigo-50 font-medium text-indigo-700 ring-1 ring-indigo-200 ring-inset"
                      : "text-zinc-600 hover:bg-zinc-100",
                  )}
                >
                  {tab.label}
                  {count !== undefined && (
                    <span
                      className={clsx(
                        "tabular-nums",
                        active ? "text-indigo-500" : "text-zinc-400",
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {triage === "NEWSLETTER" && <NewsletterCleanup accountId={accountId} />}

        <div className="flex gap-2">
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

          <select
            value={priority ?? ""}
            onChange={(event) =>
              updateParams({
                priority: event.target.value || undefined,
                page: undefined,
              })
            }
            className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600"
            aria-label="Filter by priority"
          >
            <option value="">Any priority</option>
            <option value="Urgent">Urgent</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
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
              ? `No results for "${q}" in ${(folderType ?? "snoozed").toLowerCase()}.`
              : triage
                ? TRIAGE_EMPTY[triage]
                : folderType
                ? `Nothing in ${folderType.toLowerCase()} yet.`
                : "Nothing is snoozed right now."
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
                showAccountBadge={!accountId && (accounts?.length ?? 0) > 1}
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
