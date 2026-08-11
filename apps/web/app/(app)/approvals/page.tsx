"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api/client";
import type { ApprovalChain } from "@/lib/api/types";
import {
  approveChainStep,
  listMyPendingApprovals,
  rejectChainStep,
} from "@/lib/services/approval-chains.service";

function ApprovalCard({ chain }: { chain: ApprovalChain }) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ["my-pending-approvals"] });
  }

  const approveMutation = useMutation({
    mutationFn: () => approveChainStep(chain.id, comment || undefined),
    onSuccess: () => {
      setComment("");
      void invalidate();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectChainStep(chain.id, comment || undefined),
    onSuccess: () => {
      setComment("");
      void invalidate();
    },
  });

  const currentStepIndex = chain.steps.findIndex((s) => s.status === "PENDING");
  const recipients = chain.draftMessage.to
    .map((p) => p.address)
    .filter(Boolean)
    .join(", ");

  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
          Step {currentStepIndex + 1} of {chain.steps.length}
        </span>
        <span className="text-[11px] text-zinc-400">{chain.account.email}</span>
      </div>

      <p className="mt-1.5 text-sm font-medium text-zinc-900">
        {chain.draftMessage.subject || "(no subject)"}
      </p>
      {recipients && (
        <p className="text-xs text-zinc-500">To: {recipients}</p>
      )}
      {chain.draftMessage.bodyText && (
        <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm text-zinc-600">
          {chain.draftMessage.bodyText}
        </p>
      )}

      <Link
        href={`/compose?draftId=${chain.draftMessageId}`}
        className="mt-1.5 inline-block text-xs text-indigo-600 hover:underline"
      >
        Open full draft →
      </Link>

      <ol className="mt-3 flex flex-wrap gap-1.5">
        {chain.steps.map((step) => (
          <li
            key={step.id}
            className="flex items-center gap-1 rounded-full bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200"
          >
            {step.order + 1}. {step.approver.displayName ?? step.approver.email}
            <span
              className={
                step.status === "APPROVED"
                  ? "text-emerald-600"
                  : step.status === "REJECTED"
                    ? "text-red-600"
                    : "text-zinc-400"
              }
            >
              ({step.status.toLowerCase()})
            </span>
          </li>
        ))}
      </ol>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional note (visible to the sender)"
        rows={2}
        className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
      />

      {(approveMutation.isError || rejectMutation.isError) && (
        <p className="mt-1.5 text-xs text-red-600">
          {(approveMutation.error ?? rejectMutation.error) instanceof ApiError
            ? ((approveMutation.error ?? rejectMutation.error) as ApiError).message
            : "Could not record your decision"}
        </p>
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={approveMutation.isPending || rejectMutation.isPending}
          onClick={() => approveMutation.mutate()}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {approveMutation.isPending ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={approveMutation.isPending || rejectMutation.isPending}
          onClick={() => rejectMutation.mutate()}
          className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {rejectMutation.isPending ? "Rejecting…" : "Reject"}
        </button>
      </div>
    </li>
  );
}

export default function ApprovalsPage() {
  const {
    data: chains,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["my-pending-approvals"],
    queryFn: listMyPendingApprovals,
  });

  return (
    <div className="mx-auto w-full  flex-1 space-y-6 p-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">Approvals</h1>
        <p className="text-sm text-zinc-500">
          Drafted replies waiting on your sign-off as part of a multi-step
          approval chain. Approving the final step sends the reply
          automatically; rejecting leaves it in Drafts for rework.
        </p>
      </div>

      {isLoading && <FullPageSpinner />}
      {isError && (
        <ErrorState
          message={
            error instanceof ApiError ? error.message : "Could not load approvals"
          }
        />
      )}
      {chains && chains.length === 0 && (
        <EmptyState
          title="Nothing waiting on you"
          description="When a Workflow rule requires multi-step approval and it's your turn to decide, it'll show up here."
        />
      )}

      {chains && chains.length > 0 && (
        <ul className="space-y-3">
          {chains.map((chain) => (
            <ApprovalCard key={chain.id} chain={chain} />
          ))}
        </ul>
      )}
    </div>
  );
}
