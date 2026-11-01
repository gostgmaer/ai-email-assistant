"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api/client";
import type { ImprovementSuggestion } from "@/lib/api/types";
import {
  analyzeSuggestions,
  decideSuggestion,
  listEmailAccounts,
  listSuggestions,
} from "@/lib/services/email-accounts.service";
import { formatDateTime } from "@/lib/utils/format";

const REASON_LABEL: Record<string, string> = {
  wrong_facts: "wrong facts",
  wrong_tone: "wrong tone",
  should_not_reply: "shouldn't reply",
  too_long: "too long",
  other: "other",
};

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function changeLabel(suggestion: ImprovementSuggestion): string {
  return suggestion.kind === "AGENT_INSTRUCTION"
    ? `Add to the ${suggestion.evidence.label} agent's instructions:`
    : "Add this rule, ahead of your other rules:";
}

function SuggestionCard({
  suggestion,
  accountId,
}: {
  suggestion: ImprovementSuggestion;
  accountId: string;
}) {
  const queryClient = useQueryClient();
  const decideMutation = useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      decideSuggestion(accountId, suggestion.id, decision),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["suggestions", accountId] }),
  });
  const { evidence } = suggestion;
  const reasons = Object.entries(evidence.reasons)
    .map(([reason, count]) => `${REASON_LABEL[reason] ?? reason} (${count})`)
    .join(", ");

  return (
    <li className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4 text-sm">
      <div>
        <p className="text-xs text-zinc-500">{changeLabel(suggestion)}</p>
        <p className="mt-0.5 font-medium text-zinc-900">{suggestion.change}</p>
      </div>
      {suggestion.rationale && (
        <p className="text-zinc-700">{suggestion.rationale}</p>
      )}
      <p className="text-xs text-zinc-500">
        {evidence.label}: {evidence.reviewed} reviewed, {evidence.discarded}{" "}
        discarded, {evidence.heavilyEdited} heavily edited
        {reasons && ` · reasons: ${reasons}`}
      </p>
      {evidence.examples.length > 0 && (
        <details className="text-xs text-zinc-600">
          <summary className="cursor-pointer font-medium text-zinc-700">
            See examples ({evidence.examples.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {evidence.examples.map((example) => (
              <li
                key={example.draft}
                className="rounded-md bg-zinc-50 p-2 whitespace-pre-wrap"
              >
                <p>
                  <span className="font-medium">AI draft:</span> {example.draft}
                </p>
                <p className="mt-1">
                  <span className="font-medium">
                    {example.sent ? "Sent instead:" : "Discarded."}
                  </span>{" "}
                  {example.sent}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
      {decideMutation.isError && (
        <p className="text-xs text-red-600">
          {errorText(decideMutation.error, "Something went wrong.")}
        </p>
      )}
      {suggestion.status === "PENDING" ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            loading={decideMutation.isPending}
            onClick={() => decideMutation.mutate("approve")}
          >
            Approve
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={decideMutation.isPending}
            onClick={() => decideMutation.mutate("reject")}
          >
            Reject
          </Button>
        </div>
      ) : (
        <p className="text-xs text-zinc-400">
          {suggestion.status === "APPROVED" ? "Applied" : "Rejected"}
          {suggestion.decidedAt && ` ${formatDateTime(suggestion.decidedAt)}`}
        </p>
      )}
    </li>
  );
}

export default function SuggestionsPage() {
  const queryClient = useQueryClient();
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["email-accounts"],
    queryFn: listEmailAccounts,
  });
  const [chosen, setChosen] = useState<string | null>(null);
  const accountId = chosen ?? accounts?.[0]?.id;

  const {
    data: suggestions,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["suggestions", accountId],
    queryFn: () => listSuggestions(accountId!),
    enabled: Boolean(accountId),
  });

  const analyzeMutation = useMutation({
    mutationFn: () => analyzeSuggestions(accountId!),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["suggestions", accountId] }),
  });

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-zinc-900">Suggestions</h1>
          <p className="text-sm text-zinc-500">
            Changes the AI proposes after its drafts were discarded or heavily
            rewritten. Nothing changes until the account&apos;s owner approves
            it. Checked once a week.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {accounts && accounts.length > 1 && (
            <select
              value={accountId ?? ""}
              onChange={(event) => setChosen(event.target.value)}
              aria-label="Email account"
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.email}
                </option>
              ))}
            </select>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={!accountId}
            loading={analyzeMutation.isPending}
            onClick={() => analyzeMutation.mutate()}
          >
            Check now
          </Button>
        </div>
      </div>

      {analyzeMutation.isError && (
        <p className="text-sm text-red-600">
          {errorText(analyzeMutation.error, "Could not check for suggestions.")}
        </p>
      )}
      {analyzeMutation.data?.created === 0 && (
        <p className="text-sm text-zinc-500">No new patterns found.</p>
      )}

      {(accountsLoading || isLoading) && <FullPageSpinner />}
      {isError && (
        <ErrorState
          message={errorText(error, "Could not load the suggestions")}
        />
      )}
      {suggestions && suggestions.length === 0 && (
        <EmptyState
          title="No suggestions yet"
          description="A suggestion needs at least 3 discarded or heavily rewritten drafts from one agent, or to one sender domain or category that also gets auto-replies."
        />
      )}
      {suggestions && suggestions.length > 0 && (
        <ul className="space-y-3">
          {suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              accountId={accountId!}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
