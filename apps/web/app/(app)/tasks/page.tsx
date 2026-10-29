"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import Link from "next/link";
import { useState } from "react";

import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api/client";
import type { MeetingTimeSuggestion, Task, TaskStatus } from "@/lib/api/types";
import {
  listTasks,
  scheduleMeeting,
  suggestMeeting,
  updateTaskStatus,
} from "@/lib/services/tasks.service";
import { formatDateTime, formatRelativeDate } from "@/lib/utils/format";

const STATUS_TABS: { value: TaskStatus | "ALL"; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "DONE", label: "Done" },
  { value: "DISMISSED", label: "Dismissed" },
  { value: "ALL", label: "All" },
];

const TYPE_LABEL: Record<Task["type"], string> = {
  ACTION_ITEM: "Action item",
  MEETING_REQUEST: "Meeting request",
  FOLLOW_UP: "Follow-up",
  COMMITMENT: "You promised",
};

/** "Due …" for a task with a deadline; red once an open one is overdue. */
function DueDate({ task }: { task: Task }) {
  // Read once per mount: render must stay pure, and a minute's drift in
  // "overdue" doesn't matter.
  const [now] = useState(() => Date.now());
  if (!task.dueDate) return null;
  const overdue =
    task.status === "PENDING" && new Date(task.dueDate).getTime() < now;
  return (
    <span
      className={clsx(
        "text-[11px] font-medium",
        overdue ? "text-red-600" : "text-zinc-600",
      )}
    >
      {overdue ? "Overdue since" : "Due"} {formatDateTime(task.dueDate)}
    </span>
  );
}

/** Converts an ISO datetime to the value a <input type="datetime-local">
 * expects (local time, no timezone/seconds), and back. */
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value: string): string {
  return new Date(value).toISOString();
}

function MeetingScheduler({ task }: { task: Task }) {
  const queryClient = useQueryClient();
  const [suggestion, setSuggestion] = useState<MeetingTimeSuggestion | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [includeAttendee, setIncludeAttendee] = useState(false);

  const suggestMutation = useMutation({
    mutationFn: () => suggestMeeting(task.id),
    onSuccess: (result) => {
      setSuggestion(result);
      setTitle(result.title);
      setStart(toDatetimeLocal(result.start));
      setEnd(toDatetimeLocal(result.end));
      setAttendeeEmail(result.suggestedAttendeeEmail ?? "");
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: () => {
      if (!suggestion) throw new Error("No suggestion to schedule");
      return scheduleMeeting(task.id, {
        calendarAccountId: suggestion.calendarAccountId,
        start: fromDatetimeLocal(start),
        end: fromDatetimeLocal(end),
        title,
        attendeeEmail: includeAttendee ? attendeeEmail || undefined : undefined,
      });
    },
    onSuccess: () => {
      setSuggestion(null);
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  if (task.calendarEventUrl) {
    return (
      <a
        href={task.calendarEventUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-block text-xs text-emerald-700 hover:underline"
      >
        View scheduled meeting →
      </a>
    );
  }

  if (!suggestion) {
    return (
      <button
        type="button"
        disabled={suggestMutation.isPending}
        onClick={() => suggestMutation.mutate()}
        className="mt-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {suggestMutation.isPending ? "Checking availability…" : "Suggest a time"}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-indigo-200 bg-indigo-50/50 p-2.5">
      <p className="text-xs text-indigo-700">
        Suggested — review and edit before scheduling. Nothing is created
        until you confirm.
      </p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
        placeholder="Meeting title"
      />
      <div className="flex gap-2">
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs"
        />
        <input
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs"
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-zinc-600">
        <input
          type="checkbox"
          checked={includeAttendee}
          onChange={(e) => setIncludeAttendee(e.target.checked)}
        />
        Invite attendee (sends a real calendar invite email)
      </label>
      {includeAttendee && (
        <input
          value={attendeeEmail}
          onChange={(e) => setAttendeeEmail(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-2 py-1 text-xs"
          placeholder="attendee@example.com"
        />
      )}
      {scheduleMutation.isError && (
        <p className="text-xs text-red-600">
          {scheduleMutation.error instanceof ApiError
            ? scheduleMutation.error.message
            : "Could not schedule the meeting"}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={scheduleMutation.isPending}
          onClick={() => scheduleMutation.mutate()}
          className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {scheduleMutation.isPending ? "Scheduling…" : "Confirm & schedule"}
        </button>
        <button
          type="button"
          onClick={() => setSuggestion(null)}
          className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function TasksTab() {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "ALL">(
    "PENDING",
  );
  const queryClient = useQueryClient();

  const {
    data: tasks,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["tasks", statusFilter],
    queryFn: () => listTasks(statusFilter === "ALL" ? undefined : statusFilter),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      updateTaskStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  return (
    <>
      <div className="flex gap-1 overflow-x-auto border-b border-zinc-200">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatusFilter(tab.value)}
            className={clsx(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              statusFilter === tab.value
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-zinc-500 hover:text-zinc-700",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && <FullPageSpinner />}
      {isError && (
        <ErrorState
          message={error instanceof ApiError ? error.message : "Could not load tasks"}
        />
      )}
      {tasks && tasks.length === 0 && (
        <EmptyState
          title="Nothing here"
          description="Extracted tasks, meeting requests and promises from your sent mail will show up here as your emails are processed."
        />
      )}

      {tasks && tasks.length > 0 && (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      task.type === "MEETING_REQUEST"
                        ? "bg-indigo-50 text-indigo-700"
                        : task.type === "COMMITMENT"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-zinc-100 text-zinc-600",
                    )}
                  >
                    {TYPE_LABEL[task.type]}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    {formatRelativeDate(task.createdAt)}
                  </span>
                  <DueDate task={task} />
                </div>
                <p
                  className={clsx(
                    "mt-1 text-sm",
                    task.status === "DONE"
                      ? "text-zinc-400 line-through"
                      : "text-zinc-800",
                  )}
                >
                  {task.description}
                </p>
                {task.threadId && (
                  <Link
                    href={`/inbox/${task.threadId}`}
                    className="mt-1 inline-block text-xs text-indigo-600 hover:underline"
                  >
                    View source email
                  </Link>
                )}
                {task.type === "MEETING_REQUEST" && (
                  <MeetingScheduler task={task} />
                )}
              </div>

              <div className="flex shrink-0 gap-1.5">
                {task.status !== "DONE" && (
                  <button
                    type="button"
                    disabled={updateMutation.isPending}
                    onClick={() =>
                      updateMutation.mutate({ id: task.id, status: "DONE" })
                    }
                    className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Done
                  </button>
                )}
                {task.status !== "DISMISSED" && (
                  <button
                    type="button"
                    disabled={updateMutation.isPending}
                    onClick={() =>
                      updateMutation.mutate({
                        id: task.id,
                        status: "DISMISSED",
                      })
                    }
                    className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                )}
                {task.status !== "PENDING" && (
                  <button
                    type="button"
                    disabled={updateMutation.isPending}
                    onClick={() =>
                      updateMutation.mutate({ id: task.id, status: "PENDING" })
                    }
                    className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reopen
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function TasksPage() {
  return (
    <div className="mx-auto w-full  flex-1 space-y-6 p-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">Tasks</h1>
        <p className="text-sm text-zinc-500">
          Action items and meeting requests from your inbox, and promises you
          made in sent mail (soonest due first). Emails awaiting a reply are
          under{" "}
          <Link
            href="/waiting"
            className="font-medium text-indigo-600 hover:underline"
          >
            Waiting
          </Link>
          .
        </p>
      </div>

      <TasksTab />
    </div>
  );
}
