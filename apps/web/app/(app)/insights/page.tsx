"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api/client";
import type {
  AiOutcomeSummary,
  InsightsData,
  ResponseTimeSummary,
} from "@/lib/api/types";
import {
  getInsights,
  listEmailAccounts,
  refreshInsights,
} from "@/lib/services/email-accounts.service";
import { formatDateTime } from "@/lib/utils/format";

const CHECK_LABEL: Record<string, string> = {
  URGENT: "Marked urgent",
  PERSONAL_DATA: "Contains personal data",
  PROHIBITED_PHRASE: "Prohibited phrase",
  ACTION_CLAIM: "Claims something was done or attached",
  GROUNDING: "Not grounded for this sender",
  VALIDATION: "Failed the AI's own check",
  SEND_LIMIT: "Reached a send limit",
};

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function durationLabel(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

function editLabel(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function ResponseTile({
  title,
  summary,
}: {
  title: string;
  summary: ResponseTimeSummary;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900">
        {durationLabel(summary.medianMs)}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        median first response · {summary.answered} answered,{" "}
        {summary.unanswered} not yet
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        {children}
      </div>
    </section>
  );
}

function Table({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: { key: string; cells: (string | number)[] }[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="p-3 text-sm text-zinc-500">{empty}</p>;
  }
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-zinc-100 text-xs text-zinc-500">
        <tr>
          {headers.map((header, index) => (
            <th
              key={header}
              className={`px-3 py-2 font-medium ${index > 0 ? "text-right" : ""}`}
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {rows.map((row) => (
          <tr key={row.key}>
            {row.cells.map((cell, index) => (
              <td
                key={index}
                className={`px-3 py-2 text-zinc-800 ${index > 0 ? "text-right tabular-nums" : ""}`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const AI_HEADERS = [
  "Auto-sent",
  "Held, then sent",
  "Held, then discarded",
  "Average edit",
];

function aiCells(summary: AiOutcomeSummary): (string | number)[] {
  return [
    summary.autoSent,
    summary.heldThenSent,
    summary.heldThenDiscarded,
    editLabel(summary.averageEditDistance),
  ];
}

function InsightsBody({ data }: { data: InsightsData }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <ResponseTile title="Last 7 days" summary={data.responseTimes.lastWeek} />
        <ResponseTile
          title="The 7 days before"
          summary={data.responseTimes.previousWeek}
        />
      </div>

      <Section title="Open work per person">
        <Table
          headers={["Person", "Needs a reply", "Waiting on someone else"]}
          empty="No open threads."
          rows={data.workload.map((row) => ({
            key: row.userId ?? "unassigned",
            cells: [row.name, row.openThreads, row.waitingOnReply],
          }))}
        />
      </Section>

      <Section title="AI replies per week">
        <Table
          headers={["Week starting", ...AI_HEADERS]}
          empty="No AI replies in the last 4 weeks."
          rows={data.aiByWeek.map((row) => ({
            key: row.weekStart,
            cells: [row.weekStart, ...aiCells(row)],
          }))}
        />
      </Section>

      <Section title="AI replies per agent (last 30 days)">
        <Table
          headers={["Agent", ...AI_HEADERS]}
          empty="No AI replies in the last 30 days."
          rows={data.aiByAgent.map((row) => ({
            key: row.agentId ?? "default",
            cells: [row.name, ...aiCells(row)],
          }))}
        />
      </Section>

      <Section title="What held replies back from auto-sending (last 30 days)">
        <Table
          headers={["Safety check", "Times"]}
          empty="No safety check held a reply back."
          rows={data.safety.map((row) => ({
            key: row.check,
            cells: [CHECK_LABEL[row.check] ?? row.check, row.count],
          }))}
        />
      </Section>
    </div>
  );
}

export default function InsightsPage() {
  const queryClient = useQueryClient();
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["email-accounts"],
    queryFn: listEmailAccounts,
  });
  const [chosen, setChosen] = useState<string | null>(null);
  const accountId = chosen ?? accounts?.[0]?.id;
  const queryKey = ["insights", accountId];

  const {
    data: insights,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => getInsights(accountId!),
    enabled: Boolean(accountId),
  });

  const refreshMutation = useMutation({
    mutationFn: () => refreshInsights(accountId!),
    onSuccess: (view) => queryClient.setQueryData(queryKey, view),
  });

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 space-y-4 overflow-y-auto p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-zinc-900">Insights</h1>
          <p className="text-sm text-zinc-500">
            Response times, open work and what the AI did on this inbox.
            Updated nightly
            {insights?.computedAt
              ? `, last at ${formatDateTime(insights.computedAt)}.`
              : "."}
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
            loading={refreshMutation.isPending}
            onClick={() => refreshMutation.mutate()}
          >
            Update now
          </Button>
        </div>
      </div>

      {refreshMutation.isError && (
        <p className="text-sm text-red-600">
          {errorText(refreshMutation.error, "Could not update the numbers.")}
        </p>
      )}
      {(accountsLoading || isLoading) && <FullPageSpinner />}
      {isError && (
        <ErrorState message={errorText(error, "Could not load insights")} />
      )}
      {insights && !insights.data && (
        <EmptyState
          title="Not computed yet"
          description="These numbers are worked out overnight. Use Update now to see them today."
        />
      )}
      {insights?.data && <InsightsBody data={insights.data} />}
    </div>
  );
}
