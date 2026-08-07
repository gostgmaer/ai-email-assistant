"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import Link from "next/link";
import { useState } from "react";

import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api/client";
import type { TaskStatus } from "@/lib/api/types";
import { listFollowUps } from "@/lib/services/email.service";
import { listTasks, updateTaskStatus } from "@/lib/services/tasks.service";
import { formatRelativeDate } from "@/lib/utils/format";

const STATUS_TABS: { value: TaskStatus | "ALL"; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "DONE", label: "Done" },
  { value: "DISMISSED", label: "Dismissed" },
  { value: "ALL", label: "All" },
];

const TYPE_LABEL = {
  ACTION_ITEM: "Action item",
  MEETING_REQUEST: "Meeting request",
};

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
          description="Extracted tasks and meeting requests will show up here as your emails are processed."
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
                        : "bg-zinc-100 text-zinc-600",
                    )}
                  >
                    {TYPE_LABEL[task.type]}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    {formatRelativeDate(task.createdAt)}
                  </span>
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

function FollowUpsTab() {
  const {
    data: followUps,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["follow-ups"],
    queryFn: listFollowUps,
  });

  return (
    <>
      <p className="text-xs text-zinc-500">
        Threads where you sent the last message and haven&apos;t heard back.
      </p>

      {isLoading && <FullPageSpinner />}
      {isError && (
        <ErrorState
          message={
            error instanceof ApiError ? error.message : "Could not load follow-ups"
          }
        />
      )}
      {followUps && followUps.length === 0 && (
        <EmptyState
          title="Nothing to follow up on"
          description="Threads awaiting a reply from the other side will show up here."
        />
      )}

      {followUps && followUps.length > 0 && (
        <ul className="space-y-2">
          {followUps.map((item) => (
            <li
              key={item.threadId}
              className="rounded-lg border border-zinc-200 bg-white p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  {item.daysSinceLastMessage ?? "?"} day
                  {item.daysSinceLastMessage === 1 ? "" : "s"} waiting
                </span>
                <span className="text-[11px] text-zinc-400">
                  {item.account.email}
                </span>
              </div>
              <Link
                href={`/inbox/${item.threadId}`}
                className="mt-1 block text-sm font-medium text-zinc-800 hover:text-indigo-600 hover:underline"
              >
                {item.subject || "(no subject)"}
              </Link>
              {item.relatedMeetingRequests.length > 0 && (
                <p className="mt-1 text-xs text-zinc-500">
                  Meeting request: {item.relatedMeetingRequests[0].description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function TasksPage() {
  const [view, setView] = useState<"tasks" | "follow-ups">("tasks");

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">
          Tasks &amp; Follow-ups
        </h1>
        <p className="text-sm text-zinc-500">
          Action items, meeting requests, and emails awaiting a reply —
          automatically surfaced from your inbox.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setView("tasks")}
          className={clsx(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            view === "tasks"
              ? "bg-indigo-600 text-white"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
          )}
        >
          Tasks
        </button>
        <button
          type="button"
          onClick={() => setView("follow-ups")}
          className={clsx(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            view === "follow-ups"
              ? "bg-indigo-600 text-white"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
          )}
        >
          Follow-ups
        </button>
      </div>

      {view === "tasks" ? <TasksTab /> : <FollowUpsTab />}
    </div>
  );
}
