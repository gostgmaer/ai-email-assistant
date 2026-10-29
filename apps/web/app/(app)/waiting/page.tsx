"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import Link from "next/link";
import { useState } from "react";

import { SparklesIcon } from "@/components/icons";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api/client";
import {
  listFollowUps,
  setFollowUpReminder,
  setWaiting,
  type FollowUpCandidate,
} from "@/lib/services/email.service";
import { formatDateTime, participantListLabel } from "@/lib/utils/format";

const AGE_FILTERS: { days: number; label: string }[] = [
  { days: 0, label: "All" },
  { days: 3, label: "3+ days" },
  { days: 7, label: "7+ days" },
];

const REMIND_DAYS = [1, 2, 3, 5, 7, 14];

function ageLabel(days: number | null): string {
  if (days === null) return "Waiting";
  if (days === 0) return "Today";
  return `${days} day${days === 1 ? "" : "s"}`;
}

function ageClass(days: number | null): string {
  if (days !== null && days >= 7) return "bg-red-50 text-red-700";
  if (days !== null && days >= 3) return "bg-amber-50 text-amber-700";
  return "bg-zinc-100 text-zinc-600";
}

function WaitingRow({
  item,
  onDismissed,
}: {
  item: FollowUpCandidate;
  onDismissed: (item: FollowUpCandidate) => void;
}) {
  const queryClient = useQueryClient();

  const reminderMutation = useMutation({
    mutationFn: (days: number | null) =>
      setFollowUpReminder(item.threadId, days),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] }),
  });

  const dismissMutation = useMutation({
    mutationFn: () => setWaiting(item.threadId, false),
    onSuccess: () => {
      onDismissed(item);
      void queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
    },
  });

  const error = reminderMutation.error ?? dismissMutation.error;

  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={clsx(
            "rounded-full px-2 py-0.5 text-[10px] font-medium",
            ageClass(item.daysSinceLastMessage),
          )}
        >
          {ageLabel(item.daysSinceLastMessage)}
        </span>
        {item.waitingOn.length > 0 && (
          <span className="truncate text-xs text-zinc-600">
            Waiting on {participantListLabel(item.waitingOn)}
          </span>
        )}
        <span className="text-[11px] text-zinc-400">{item.account.email}</span>
      </div>

      <Link
        href={`/inbox/${item.threadId}`}
        className="mt-1 block text-sm font-medium text-zinc-800 hover:text-indigo-600 hover:underline"
      >
        {item.subject || "(no subject)"}
      </Link>
      {(item.summary || item.snippet) && (
        <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
          {item.summary ?? item.snippet}
        </p>
      )}
      {item.relatedMeetingRequests.length > 0 && (
        <p className="mt-1 text-xs text-zinc-500">
          Meeting request: {item.relatedMeetingRequests[0].description}
        </p>
      )}
      {item.openCommitments.map((commitment) => (
        <p key={commitment.id} className="mt-1 text-xs text-amber-700">
          You promised: {commitment.description}
          {commitment.dueDate && ` (due ${formatDateTime(commitment.dueDate)})`}
        </p>
      ))}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <Link
          href={`/inbox/${item.threadId}?followUp=1`}
          className="flex items-center gap-1 font-medium text-indigo-600 hover:underline"
        >
          <SparklesIcon className="h-3.5 w-3.5" />
          Draft follow-up
        </Link>

        {item.followUpAt ? (
          <span className="flex items-center gap-1.5 text-zinc-600">
            Reminder {formatDateTime(item.followUpAt)}
            <button
              type="button"
              onClick={() => reminderMutation.mutate(null)}
              disabled={reminderMutation.isPending}
              className="text-zinc-500 underline hover:text-zinc-800 disabled:opacity-50"
            >
              Cancel
            </button>
          </span>
        ) : (
          <select
            value=""
            disabled={reminderMutation.isPending}
            onChange={(event) =>
              reminderMutation.mutate(Number(event.target.value))
            }
            aria-label={`Remind me about "${item.subject || "(no subject)"}"`}
            className="rounded-md border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-700"
          >
            <option value="">Remind me in…</option>
            {REMIND_DAYS.map((days) => (
              <option key={days} value={days}>
                {days} day{days === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => dismissMutation.mutate()}
          disabled={dismissMutation.isPending}
          className="text-zinc-500 hover:text-zinc-800 hover:underline disabled:opacity-50"
        >
          Not waiting
        </button>
      </div>

      {error && (
        <p className="mt-1 text-xs text-red-600">
          {error instanceof Error ? error.message : "Something went wrong"}
        </p>
      )}
    </li>
  );
}

export default function WaitingPage() {
  const [olderThanDays, setOlderThanDays] = useState(0);
  // The last thread marked "Not waiting", so it can be put back.
  const [dismissed, setDismissed] = useState<FollowUpCandidate | null>(null);
  const queryClient = useQueryClient();

  const {
    data: followUps,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["follow-ups", olderThanDays],
    queryFn: () => listFollowUps(olderThanDays),
  });

  const undoMutation = useMutation({
    mutationFn: (threadId: string) => setWaiting(threadId, true),
    onSuccess: () => {
      setDismissed(null);
      void queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
    },
  });

  return (
    <div className="mx-auto w-full flex-1 space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">Waiting on reply</h1>
        <p className="text-sm text-zinc-500">
          Emails where you sent the last message and nobody has answered yet.
          A thread leaves this list as soon as someone replies.
        </p>
      </div>

      <div className="flex gap-2">
        {AGE_FILTERS.map((filter) => (
          <button
            key={filter.days}
            type="button"
            onClick={() => setOlderThanDays(filter.days)}
            aria-pressed={olderThanDays === filter.days}
            className={clsx(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              olderThanDays === filter.days
                ? "bg-indigo-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {dismissed && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
          <span className="truncate">
            Removed &ldquo;{dismissed.subject || "(no subject)"}&rdquo;. It
            comes back if you write on it again.
          </span>
          <button
            type="button"
            onClick={() => undoMutation.mutate(dismissed.threadId)}
            disabled={undoMutation.isPending}
            className="shrink-0 font-medium text-indigo-600 hover:underline disabled:opacity-50"
          >
            Undo
          </button>
        </div>
      )}

      {isLoading && <FullPageSpinner />}
      {isError && (
        <ErrorState
          message={
            error instanceof ApiError
              ? error.message
              : "Could not load emails waiting on a reply"
          }
        />
      )}
      {followUps && followUps.length === 0 && (
        <EmptyState
          title="Nothing waiting"
          description={
            olderThanDays > 0
              ? `Nothing has been waiting ${olderThanDays}+ days for a reply.`
              : "Emails you send that nobody has answered will show up here."
          }
        />
      )}

      {followUps && followUps.length > 0 && (
        <ul className="space-y-2">
          {followUps.map((item) => (
            <WaitingRow
              key={item.threadId}
              item={item}
              onDismissed={setDismissed}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
