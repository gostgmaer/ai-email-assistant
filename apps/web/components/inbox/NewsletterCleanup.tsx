"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api/client";
import {
  cleanupNewsletters,
  previewNewsletterCleanup,
  type NewsletterCleanupResult,
} from "@/lib/services/email.service";

const AGE_OPTIONS = [7, 30, 90];

/**
 * "Clean up" on the Newsletters group: archives newsletters older than N
 * days — in the mailbox itself, so it shows the count first and asks for a
 * second click before doing anything.
 */
export function NewsletterCleanup({ accountId }: { accountId?: string }) {
  const queryClient = useQueryClient();
  const [days, setDays] = useState(30);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<NewsletterCleanupResult | null>(null);

  const { data: preview } = useQuery({
    queryKey: ["newsletter-cleanup", days, accountId],
    queryFn: () => previewNewsletterCleanup(days, accountId),
  });

  const cleanupMutation = useMutation({
    mutationFn: () => cleanupNewsletters(days, accountId),
    onSuccess: (outcome) => {
      setResult(outcome);
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["triage-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["newsletter-cleanup"] });
    },
  });

  const count = preview?.count ?? 0;

  return (
    <div className="space-y-1.5 rounded-md bg-zinc-50 px-2.5 py-2 text-xs text-zinc-600 ring-1 ring-zinc-200 ring-inset">
      <div className="flex flex-wrap items-center gap-2">
        <span>Clean up newsletters older than</span>
        <select
          value={days}
          onChange={(event) => {
            setDays(Number(event.target.value));
            setConfirming(false);
            setResult(null);
          }}
          className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-xs"
          aria-label="Newsletter age"
        >
          {AGE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option} days
            </option>
          ))}
        </select>
        {!confirming ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={count === 0}
            onClick={() => {
              setResult(null);
              setConfirming(true);
            }}
          >
            {count === 0 ? "Nothing to archive" : `Archive ${count}…`}
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              loading={cleanupMutation.isPending}
              onClick={() => cleanupMutation.mutate()}
            >
              Archive {count}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={cleanupMutation.isPending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </>
        )}
      </div>
      {confirming && (
        <p>
          This archives {count} newsletter{count === 1 ? "" : "s"} in your
          mailbox too, not only here. Nothing is deleted.
        </p>
      )}
      {result && (
        <p>
          Archived {result.archived}.
          {result.failed > 0 && ` ${result.failed} couldn't be archived.`}
          {result.remaining > 0 && ` ${result.remaining} left — run it again.`}
        </p>
      )}
      {cleanupMutation.isError && (
        <p className="text-red-600">
          {cleanupMutation.error instanceof ApiError
            ? cleanupMutation.error.message
            : "Clean up failed. Try again."}
        </p>
      )}
    </div>
  );
}
