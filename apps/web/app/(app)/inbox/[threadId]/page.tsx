"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ChevronLeftIcon, ClockIcon, SparklesIcon } from "@/components/icons";
import { ReplyBox } from "@/components/inbox/ReplyBox";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { summarize, toAiThreadMessage } from "@/lib/services/ai.service";
import { listAccountMembers } from "@/lib/services/email-accounts.service";
import {
  addThreadNote,
  assignThread,
  deleteThreadNote,
  getThread,
  markMessageRead,
  snoozeThread,
  unsnoozeThread,
} from "@/lib/services/email.service";
import {
  formatDateTime,
  participantListLabel,
  providerLabel,
} from "@/lib/utils/format";

const SNOOZE_PRESETS: { label: string; hoursFromNow: number }[] = [
  { label: "Later today (+3h)", hoursFromNow: 3 },
  { label: "Tomorrow morning", hoursFromNow: 18 },
  { label: "Next week", hoursFromNow: 24 * 7 },
];

// Email HTML is untrusted content — sanitize/render client-only, never on the server.
const MessageBody = dynamic(
  () => import("@/components/inbox/MessageBody").then((m) => m.MessageBody),
  { ssr: false, loading: () => <Spinner /> },
);

export default function ThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [noteText, setNoteText] = useState("");

  const {
    data: thread,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => getThread(threadId),
  });

  // Shared Inbox: who can this thread be assigned to. Only fetched once
  // the account is known, so this can't run before `thread` loads.
  const { data: members } = useQuery({
    queryKey: ["account-members", thread?.account.id],
    queryFn: () => listAccountMembers(thread!.account.id),
    enabled: Boolean(thread?.account.id),
  });

  const assignMutation = useMutation({
    mutationFn: (assigneeUserId: string | null) =>
      assignThread(threadId, assigneeUserId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["thread", threadId] }),
  });

  const addNoteMutation = useMutation({
    mutationFn: (body: string) => addThreadNote(threadId, body),
    onSuccess: () => {
      setNoteText("");
      void queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) => deleteThreadNote(threadId, noteId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["thread", threadId] }),
  });

  const markReadMutation = useMutation({ mutationFn: markMessageRead });

  const snoozeMutation = useMutation({
    mutationFn: (until: string) => snoozeThread(threadId, until),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      router.push("/inbox");
    },
  });

  const unsnoozeMutation = useMutation({
    mutationFn: () => unsnoozeThread(threadId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
    },
  });

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
  const isSnoozed = Boolean(
    thread.snoozedUntil && new Date(thread.snoozedUntil) > new Date(),
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-zinc-50">
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3">
        <Link
          href="/inbox"
          aria-label="Back to inbox"
          className="-ml-1 rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 lg:hidden"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-zinc-900">
          {thread.subject || "(no subject)"}
        </h1>
        <span
          title={`${providerLabel(thread.account.provider)} · ${thread.account.email}`}
          className="hidden shrink-0 rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500 sm:inline-block"
        >
          {thread.account.email}
        </span>
        {members && members.length > 1 && (
          <select
            value={thread.assignedTo?.id ?? ""}
            disabled={assignMutation.isPending}
            onChange={(event) =>
              assignMutation.mutate(event.target.value || null)
            }
            aria-label="Assign this thread"
            className="hidden shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 sm:inline-block"
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.user.displayName ?? member.user.email}
              </option>
            ))}
          </select>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowNotes((v) => !v)}
        >
          Notes {thread.notes.length > 0 ? `(${thread.notes.length})` : ""}
        </Button>
        {isSnoozed ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => unsnoozeMutation.mutate()}
            loading={unsnoozeMutation.isPending}
          >
            <ClockIcon className="h-4 w-4" />
            Snoozed — unsnooze
          </Button>
        ) : (
          <div className="relative">
            <select
              value=""
              disabled={snoozeMutation.isPending}
              onChange={(event) => {
                const hours = Number(event.target.value);
                if (!hours) return;
                const until = new Date(
                  Date.now() + hours * 60 * 60 * 1000,
                ).toISOString();
                snoozeMutation.mutate(until);
              }}
              aria-label="Snooze this thread"
              className="appearance-none rounded-full border border-zinc-200 bg-zinc-50 py-1.5 pr-7 pl-3 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Snooze…</option>
              {SNOOZE_PRESETS.map((preset) => (
                <option key={preset.label} value={preset.hoursFromNow}>
                  {preset.label}
                </option>
              ))}
            </select>
            <ClockIcon className="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          </div>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSummarize}
          loading={summaryLoading}
        >
          <SparklesIcon className="h-4 w-4" />
          Summarize
        </Button>
      </div>

      {summaryError && (
        <p className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          {summaryError}
        </p>
      )}
      {summary && (
        <div className="shrink-0 border-b border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-indigo-500 uppercase">
            <SparklesIcon className="h-3.5 w-3.5" />
            AI Summary
          </p>
          {summary}
        </div>
      )}

      {showNotes && (
        <div className="shrink-0 border-b border-amber-100 bg-amber-50 px-4 py-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-amber-700 uppercase">
            Internal notes — never sent, only visible to this account&apos;s
            shared inbox members
          </p>
          <div className="mb-2 space-y-2">
            {thread.notes.map((note) => (
              <div
                key={note.id}
                className="flex items-start justify-between gap-2 rounded-md bg-white px-3 py-2 text-sm shadow-sm"
              >
                <div className="min-w-0">
                  <p className="text-zinc-800">{note.body}</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {note.author.displayName ?? note.author.email} ·{" "}
                    {formatDateTime(note.createdAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteNoteMutation.mutate(note.id)}
                  loading={
                    deleteNoteMutation.isPending &&
                    deleteNoteMutation.variables === note.id
                  }
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (noteText.trim()) addNoteMutation.mutate(noteText.trim());
            }}
          >
            <input
              type="text"
              placeholder="Add a note for your team…"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="w-full rounded-md border border-amber-200 bg-white px-3 py-1.5 text-sm"
            />
            <Button type="submit" size="sm" loading={addNoteMutation.isPending}>
              Add
            </Button>
          </form>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {thread.messages.map((message) => {
          const senderLabel = participantListLabel(message.from);
          return (
            <article
              key={message.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex items-start gap-3">
                <Avatar label={senderLabel} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-zinc-900">
                      {senderLabel}
                    </p>
                    <span className="shrink-0 text-xs whitespace-nowrap text-zinc-400">
                      {formatDateTime(message.receivedAt)}
                    </span>
                  </div>
                  <p className="truncate text-xs text-zinc-500">
                    to {participantListLabel(message.to)}
                  </p>
                  {message.generationMetadata?.ragUsed && (
                    <span
                      title={`Grounded in: ${message.generationMetadata.documents
                        .map((doc) => doc.filename)
                        .filter((name, i, all) => all.indexOf(name) === i)
                        .join(", ")}`}
                      className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
                    >
                      <SparklesIcon className="h-3 w-3" />
                      Grounded in your documents
                    </span>
                  )}
                </div>
              </div>
              <div className="pl-12">
                <MessageBody bodyHtml={message.bodyHtml} bodyText={message.bodyText} />
              </div>
            </article>
          );
        })}
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
