import Link from "next/link";

import type { RuleDryRunResult } from "@/lib/api/types";
import { formatDateTime } from "@/lib/utils/format";

/** What "Test rule" found: the recent messages the rule would have matched.
 * Nothing was executed. */
export function RuleTestResults({
  result,
  onClose,
}: {
  result: RuleDryRunResult;
  onClose: () => void;
}) {
  return (
    <div className="mt-2 rounded-md bg-zinc-50 p-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-zinc-700">
          Would match {result.matches.length} of your last {result.evaluated}{" "}
          classified messages. Nothing was run.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-700"
        >
          ✕
        </button>
      </div>
      {result.matches.length > 0 && (
        <ul className="mt-1.5 max-h-48 space-y-1 overflow-y-auto">
          {result.matches.map((match) => (
            <li key={match.messageId} className="flex gap-2 text-zinc-600">
              <span className="shrink-0 text-zinc-400">
                {formatDateTime(match.receivedAt)}
              </span>
              <Link
                href={`/inbox/${match.threadId}`}
                className="truncate hover:underline"
              >
                {match.subject ?? "(no subject)"}
              </Link>
              <span className="shrink-0 truncate text-zinc-400">
                {match.sender}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
