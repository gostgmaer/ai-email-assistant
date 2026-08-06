"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ReplyBox } from "@/components/inbox/ReplyBox";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { summarize, toAiThreadMessage } from "@/lib/services/ai.service";
import { getThread, markMessageRead } from "@/lib/services/email.service";
import { formatDateTime, participantListLabel } from "@/lib/utils/format";

// Email HTML is untrusted content — sanitize/render client-only, never on the server.
const MessageBody = dynamic(
  () => import("@/components/inbox/MessageBody").then((m) => m.MessageBody),
  { ssr: false, loading: () => <Spinner /> },
);

export default function ThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const {
    data: thread,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => getThread(threadId),
  });

  const markReadMutation = useMutation({ mutationFn: markMessageRead });

  useEffect(() => {
    if (!thread) return;
    const unread = thread.messages.filter((message) => !message.isRead);
    unread.forEach((message) => markReadMutation.mutate(message.id));
    if (unread.length > 0) {
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
    }
    // Only re-run when the thread identity changes, not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id]);

  async function handleSummarize() {
    if (!thread) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const result = await summarize(
        thread.subject ?? "",
        thread.messages.map(toAiThreadMessage),
      );
      setSummary(result.summary);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Failed to summarize");
    } finally {
      setSummaryLoading(false);
    }
  }

  if (isLoading) return <FullPageSpinner />;

  if (isError || !thread) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : "Thread not found"}
      />
    );
  }

  const lastMessage = thread.messages[thread.messages.length - 1];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <Link href="/inbox" className="text-xs text-indigo-600 hover:underline">
            ← Back to inbox
          </Link>
          <h1 className="mt-1 truncate text-lg font-semibold text-zinc-900">
            {thread.subject || "(no subject)"}
          </h1>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSummarize}
          loading={summaryLoading}
        >
          Summarize
        </Button>
      </div>

      {summaryError && (
        <p className="border-b border-zinc-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          {summaryError}
        </p>
      )}
      {summary && (
        <div className="border-b border-zinc-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-500">
            AI Summary
          </p>
          {summary}
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {thread.messages.map((message) => (
          <article
            key={message.id}
            className="rounded-lg border border-zinc-200 bg-white p-4"
          >
            <div className="mb-2 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {participantListLabel(message.from)}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  to {participantListLabel(message.to)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {message.generationMetadata?.ragUsed && (
                  <span
                    title={`Grounded in: ${message.generationMetadata.documents
                      .map((doc) => doc.filename)
                      .filter((name, i, all) => all.indexOf(name) === i)
                      .join(", ")}`}
                    className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700"
                  >
                    📄 Grounded in your documents
                  </span>
                )}
                <span className="text-xs text-zinc-400">
                  {formatDateTime(message.receivedAt)}
                </span>
              </div>
            </div>
            <MessageBody bodyHtml={message.bodyHtml} bodyText={message.bodyText} />
          </article>
        ))}
      </div>

      {lastMessage && (
        <ReplyBox
          threadId={thread.id}
          subject={thread.subject ?? ""}
          messages={thread.messages}
          lastMessage={lastMessage}
        />
      )}
    </div>
  );
}
