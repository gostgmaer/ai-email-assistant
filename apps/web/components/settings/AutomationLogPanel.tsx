import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import type { AutomationLogEntry, DraftQualityMetrics } from "@/lib/api/types";
import {
  getAutomationLog,
  getAutomationMetrics,
} from "@/lib/services/email-accounts.service";
import { formatDateTime } from "@/lib/utils/format";

const PAGE_SIZE = 50;

const SEND_STATUS: Record<string, { label: string; style: string }> = {
  DONE: { label: "sent", style: "bg-emerald-50 text-emerald-700" },
  SCHEDULED: { label: "scheduled", style: "bg-indigo-50 text-indigo-700" },
  CANCELLED: { label: "cancelled", style: "bg-zinc-100 text-zinc-500" },
  PENDING: { label: "outcome unknown", style: "bg-amber-50 text-amber-700" },
};

const RULE_STATUS: Record<string, string> = {
  done: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  failed: "bg-red-50 text-red-700",
};

/**
 * What the automation did on this account, newest first: every reply sent
 * without review (which rule allowed it, the reply's confidence, the
 * documents it drew on) and every rule run with each action's result.
 */
export function AutomationLogPanel({ accountId }: { accountId: string }) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["automation-log", accountId],
      queryFn: ({ pageParam }) => getAutomationLog(accountId, pageParam),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) =>
        last.length >= PAGE_SIZE ? last[last.length - 1].at : undefined,
    });

  const entries = data?.pages.flat() ?? [];

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <QualityCard accountId={accountId} />

      <p className="mb-2 text-xs text-zinc-500">
        Replies sent without review and rule runs, newest first. Rule history
        is kept for 90 days.
      </p>
      {isLoading && <p className="text-xs text-zinc-400">Loading…</p>}
      {!isLoading && entries.length === 0 && (
        <p className="text-xs text-zinc-400">Nothing has run yet.</p>
      )}
      <ul className="space-y-1.5">
        {entries.map((entry, i) => (
          <LogEntry key={`${entry.kind}-${entry.messageId}-${i}`} entry={entry} />
        ))}
      </ul>
      {hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => void fetchNextPage()}
          loading={isFetchingNextPage}
        >
          Load older
        </Button>
      )}
    </div>
  );
}

const percent = (value: number | null) =>
  value === null ? "—" : `${Math.round(value * 100)}%`;

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

function QualityRow({ label, metrics }: { label: string; metrics: DraftQualityMetrics }) {
  return (
    <tr className="border-t border-zinc-100">
      <td className="py-1 pr-3 text-zinc-700">{label}</td>
      <td className="px-2 py-1">{metrics.reviewed}</td>
      <td className="px-2 py-1">{percent(metrics.acceptanceRate)}</td>
      <td className="px-2 py-1">{percent(metrics.editRate)}</td>
      <td className="px-2 py-1">{percent(metrics.rejectionRate)}</td>
      <td className="px-2 py-1">{formatDuration(metrics.medianTimeToSendMs)}</td>
      <td className="px-2 py-1">{metrics.autoSent}</td>
    </tr>
  );
}

/** AI draft quality over the last 30 days: how often drafts go out as
 * written, get edited, or get thrown away. */
function QualityCard({ accountId }: { accountId: string }) {
  const { data: metrics } = useQuery({
    queryKey: ["automation-metrics", accountId],
    queryFn: () => getAutomationMetrics(accountId),
  });

  if (!metrics) return null;
  if (metrics.overall.reviewed === 0 && metrics.overall.autoSent === 0) {
    return (
      <p className="mb-3 text-xs text-zinc-400">
        No AI drafts were sent or discarded in the last {metrics.days} days.
      </p>
    );
  }

  return (
    <div className="mb-4 overflow-x-auto rounded-md bg-zinc-50 p-2">
      <p className="mb-1 text-xs font-medium text-zinc-700">
        AI draft quality, last {metrics.days} days
      </p>
      <table className="text-xs text-zinc-600">
        <thead>
          <tr className="text-left text-zinc-500">
            <th className="pr-3 font-medium" />
            <th className="px-2 font-medium" title="Sent or discarded by a person">
              Reviewed
            </th>
            <th className="px-2 font-medium" title="Sent without any change">
              Sent as is
            </th>
            <th className="px-2 font-medium" title="Edited before sending, of those sent">
              Edited
            </th>
            <th className="px-2 font-medium" title="Discarded instead of sent">
              Discarded
            </th>
            <th className="px-2 font-medium" title="Median time from draft to send">
              Time to send
            </th>
            <th className="px-2 font-medium" title="Sent without review">
              Auto-sent
            </th>
          </tr>
        </thead>
        <tbody>
          <QualityRow label="All" metrics={metrics.overall} />
          {metrics.byAgent.map((agent) => (
            <QualityRow key={agent.agentId} label={agent.agentName} metrics={agent} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogEntry({ entry }: { entry: AutomationLogEntry }) {
  const subject = entry.threadId ? (
    <Link href={`/inbox/${entry.threadId}`} className="hover:underline">
      {entry.subject ?? "(no subject)"}
    </Link>
  ) : (
    (entry.subject ?? "(no subject)")
  );

  if (entry.kind === "SEND") {
    const status = SEND_STATUS[entry.status] ?? {
      label: entry.status,
      style: "bg-zinc-100 text-zinc-500",
    };
    const details = entry.details;
    return (
      <li className="rounded-md border border-zinc-200 p-2 text-xs">
        <div className="flex items-center gap-2">
          <span className={clsx("rounded-full px-2 py-0.5 font-medium", status.style)}>
            Auto-reply {status.label}
          </span>
          <span className="truncate text-zinc-700">{subject}</span>
          <span className="ml-auto shrink-0 text-zinc-400">
            {formatDateTime(entry.at)}
          </span>
        </div>
        <p className="mt-1 text-zinc-500">
          To {entry.recipient ?? "?"}
          {details?.rule && ` · rule "${details.rule.name}"`}
          {details?.confidence != null && ` · confidence ${details.confidence}`}
          {details?.documents && details.documents.length > 0 &&
            ` · drew on ${[...new Set(details.documents)].join(", ")}`}
          {entry.status === "SCHEDULED" &&
            details?.scheduledFor &&
            ` · sends ${formatDateTime(details.scheduledFor)}`}
        </p>
      </li>
    );
  }

  return (
    <li className="rounded-md border border-zinc-200 p-2 text-xs">
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            "rounded-full px-2 py-0.5 font-medium",
            RULE_STATUS[entry.status] ?? "bg-zinc-100 text-zinc-500",
          )}
        >
          Rule {entry.status}
        </span>
        <span className="shrink-0 font-medium text-zinc-700">
          {entry.ruleName}
        </span>
        <span className="truncate text-zinc-500">{subject}</span>
        <span className="ml-auto shrink-0 text-zinc-400">
          {formatDateTime(entry.at)}
        </span>
      </div>
      {entry.results && entry.results.length > 0 && (
        <p className="mt-1 text-zinc-500">
          {entry.results
            .map(
              (result) =>
                `${result.type} ${result.status}${result.detail ? ` (${result.detail})` : ""}`,
            )
            .join(" · ")}
        </p>
      )}
    </li>
  );
}
