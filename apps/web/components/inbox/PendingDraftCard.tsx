"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { SparklesIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import type { DraftDiscardReason, PendingDraftReply } from "@/lib/api/types";
import {
  cancelScheduledSend,
  deleteDraft,
  sendDraft,
} from "@/lib/services/email.service";
import { formatDateTime } from "@/lib/utils/format";

const DISCARD_REASONS: { value: DraftDiscardReason; label: string }[] = [
  { value: "WRONG_FACTS", label: "Wrong facts" },
  { value: "WRONG_TONE", label: "Wrong tone" },
  { value: "SHOULD_NOT_REPLY", label: "Shouldn't reply" },
  { value: "TOO_LONG", label: "Too long" },
  { value: "OTHER", label: "Other" },
];

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
    mutationFn: (reason?: DraftDiscardReason) => deleteDraft(draft.id, reason),
    onSuccess: refresh,
  });
  const [askingReason, setAskingReason] = useState(false);

  const cancelSendMutation = useMutation({
    mutationFn: () => cancelScheduledSend(draft.id),
    onSuccess: refresh,
  });

  const awaitingApproval = draft.approvalChain?.status === "PENDING";
  const error =
    sendMutation.error ?? discardMutation.error ?? cancelSendMutation.error;

  return (
    <div className="mt-3 ml-12 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-indigo-600 uppercase">
          <SparklesIcon className="h-3.5 w-3.5" />
          {draft.scheduledSendAt
            ? "AI reply — sending automatically"
            : "AI draft reply — awaiting your review"}
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

      {draft.generationMetadata?.unsupportedClaims &&
        draft.generationMetadata.unsupportedClaims.length > 0 && (
          <div className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 ring-1 ring-amber-200 ring-inset">
            <p className="font-medium">
              Check before sending — this may state things the conversation
              doesn&apos;t support:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {draft.generationMetadata.unsupportedClaims.map((claim) => (
                <li key={claim}>{claim}</li>
              ))}
            </ul>
          </div>
        )}

      {draft.scheduledSendAt && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-white px-2 py-1.5 text-xs text-indigo-700 ring-1 ring-indigo-200 ring-inset">
          <span>
            Sends at {formatDateTime(draft.scheduledSendAt)} unless you cancel.
            Editing it also cancels the automatic send.
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => cancelSendMutation.mutate()}
            loading={cancelSendMutation.isPending}
          >
            Cancel send
          </Button>
        </div>
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
          onClick={() => setAskingReason(true)}
          disabled={sendMutation.isPending || askingReason}
        >
          Discard
        </Button>
      </div>

      {askingReason && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-600">
          <span>Why? It helps the AI improve.</span>
          {DISCARD_REASONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              disabled={discardMutation.isPending}
              onClick={() => discardMutation.mutate(value)}
              className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {label}
            </button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            loading={discardMutation.isPending}
            onClick={() => discardMutation.mutate(undefined)}
          >
            Just discard
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={discardMutation.isPending}
            onClick={() => setAskingReason(false)}
          >
            Keep it
          </Button>
        </div>
      )}
    </div>
  );
}
