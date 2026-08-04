"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { BellIcon } from "@/components/icons";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadCount,
} from "@/lib/services/notifications.service";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: unread } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: unreadCount,
    refetchInterval: 30_000,
  });

  const { data: page, isLoading } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => listNotifications({ limit: 10 }),
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <BellIcon className="h-5 w-5" />
        {!!unread?.count && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
            {unread.count > 9 ? "9+" : unread.count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-zinc-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2">
              <span className="text-sm font-medium text-zinc-900">
                Notifications
              </span>
              <button
                type="button"
                onClick={() => markAllMutation.mutate()}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
              >
                Mark all read
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {isLoading && (
                <p className="px-4 py-6 text-center text-sm text-zinc-500">
                  Loading…
                </p>
              )}
              {!isLoading && !page?.notifications.length && (
                <p className="px-4 py-6 text-center text-sm text-zinc-500">
                  You&apos;re all caught up
                </p>
              )}
              {page?.notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markReadMutation.mutate(n.id)}
                  className={`block w-full border-b border-zinc-50 px-4 py-3 text-left last:border-none hover:bg-zinc-50 ${
                    n.isRead ? "" : "bg-indigo-50/50"
                  }`}
                >
                  <p className="text-sm font-medium text-zinc-900">
                    {n.title}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">{n.body}</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
