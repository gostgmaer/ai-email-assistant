"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { SparklesIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import type { PendingDraftReply } from "@/lib/api/types";
import { deleteDraft, sendDraft } from "@/lib/services/email.service";
import { formatDateTime } from "@/lib/utils/format";

/**
 * An AI-generated reply held for review, shown directly under the message
 * it answers so the reviewer judges it against the actual conversation.
 * Sending it goes out as a threaded reply (ComposeService.sendDraft).
 */
export function PendingDraftCard({
  draft,
  threadId,
}: {
  draft: PendingDraftReply;
  threadId: string;
}) {
  const queryClient = useQueryClient();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
    void queryClient.invalidateQueries({ queryKey: ["threads"] });
  };

  const sendMutation = useMutation({
    mutationFn: () => sendDraft(draft.id),
    onSuccess: refresh,
  });

  const discardMutation = useMutation({
    mutationFn: () => deleteDraft(draft.id),
    onSuccess: refresh,
  });

  const awaitingApproval = draft.approvalChain?.status === "PENDING";
  const error = sendMutation.error ?? discardMutation.error;

  return (
    <div className="mt-3 ml-12 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-indigo-600 uppercase">
          <SparklesIcon className="h-3.5 w-3.5" />
          AI draft reply — awaiting your review
        </p>
        <span className="text-xs text-indigo-400">
          {formatDateTime(draft.createdAt)}
        </span>
      </div>

      <p className="text-sm whitespace-pre-wrap text-zinc-800">
        {draft.bodyText}
      </p>

      {draft.generationMetadata?.ragUsed && (
        <p className="mt-2 text-xs text-indigo-500">
          Grounded in:{" "}
          {draft.generationMetadata.documents
            .map((doc) => doc.filename)
            .filter((name, i, all) => all.indexOf(name) === i)
            .join(", ")}
        </p>
      )}

      {awaitingApproval && (
        <p className="mt-2 text-xs text-amber-700">
          Gated by an approval chain — it can be sent once every step
          approves (see the Approvals page).
        </p>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-600">
          {error instanceof Error ? error.message : "Something went wrong"}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => sendMutation.mutate()}
          loading={sendMutation.isPending}
          disabled={awaitingApproval || discardMutation.isPending}
        >
          Send reply
        </Button>
        <Link
          href={`/compose?draftId=${draft.id}`}
          className="rounded-md px-2.5 py-1.5 text-sm font-medium text-zinc-700 ring-1 ring-zinc-300 ring-inset hover:bg-white"
        >
          Edit
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => discardMutation.mutate()}
          loading={discardMutation.isPending}
          disabled={sendMutation.isPending}
        >
          Discard
        </Button>
      </div>
    </div>
  );
}
