"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ThreadRow } from "@/components/inbox/ThreadRow";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { MailFolderType } from "@/lib/api/types";
import { listEmailAccounts } from "@/lib/services/email-accounts.service";
import { listThreads } from "@/lib/services/email.service";

const FOLDER_TABS: { type: MailFolderType; label: string }[] = [
  { type: "INBOX", label: "Inbox" },
  { type: "SENT", label: "Sent" },
  { type: "DRAFTS", label: "Drafts" },
  { type: "ARCHIVE", label: "Archive" },
  { type: "SPAM", label: "Spam" },
  { type: "TRASH", label: "Trash" },
];

const FOLDER_TYPE_VALUES = FOLDER_TABS.map((tab) => tab.type);

function isFolderType(value: string | null): value is MailFolderType {
  return FOLDER_TYPE_VALUES.includes(value as MailFolderType);
}

function InboxContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // The URL is the single source of truth for filters/pagination, so tab
  // clicks, the topbar search, and draft links (?folderType=DRAFTS) all stay
  // in sync without needing to mirror params into local state.
  const q = searchParams.get("q") ?? "";
  const folderTypeParam = searchParams.get("folderType");
  const folderType = isFolderType(folderTypeParam) ? folderTypeParam : "INBOX";
  const accountId = searchParams.get("accountId") ?? undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  function updateParams(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
    }
    router.push(`${pathname}?${next.toString()}`);
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
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2">
        <div className="flex gap-1">
          {FOLDER_TABS.map((tab) => (
            <button
              key={tab.type}
              type="button"
              onClick={() => updateParams({ folderType: tab.type, page: undefined })}
              className={clsx(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                folderType === tab.type
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-zinc-600 hover:bg-zinc-100",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {accounts && accounts.length > 1 && (
          <select
            value={accountId ?? ""}
            onChange={(event) =>
              updateParams({ accountId: event.target.value || undefined, page: undefined })
            }
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
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

      {isLoading && <FullPageSpinner />}

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
          <div className="flex-1 overflow-y-auto">
            {threadsPage.threads.map((thread) => (
              <ThreadRow key={thread.id} thread={thread} />
            ))}
          </div>

          {threadsPage.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-zinc-200 bg-white px-4 py-2">
              <span className="text-xs text-zinc-500">
                Page {threadsPage.page} of {threadsPage.totalPages} ·{" "}
                {threadsPage.total} threads
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => updateParams({ page: String(Math.max(1, page - 1)) })}
                >
                  Previous
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

export default function InboxPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <InboxContent />
    </Suspense>
  );
}
