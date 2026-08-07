"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { GoogleIcon, MicrosoftIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import {
  connectGoogleCalendarUrl,
  connectMicrosoftCalendarUrl,
  disconnectCalendarAccount,
  getAvailability,
  listCalendarAccounts,
} from "@/lib/services/calendar-accounts.service";
import type { BusyInterval } from "@/lib/api/types";
import { calendarProviderLabel, formatDateTime } from "@/lib/utils/format";

function CalendarAccountsContent() {
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected");
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [busyByAccount, setBusyByAccount] = useState<
    Record<string, BusyInterval[]>
  >({});

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["calendar-accounts"],
    queryFn: listCalendarAccounts,
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectCalendarAccount,
    onMutate: (id) => setPendingId(id),
    onSettled: () => {
      setPendingId(null);
      void queryClient.invalidateQueries({ queryKey: ["calendar-accounts"] });
    },
  });

  const availabilityMutation = useMutation({
    mutationFn: (accountId: string) => {
      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return getAvailability(
        accountId,
        now.toISOString(),
        in7Days.toISOString(),
      );
    },
    onSuccess: (busy, accountId) => {
      setBusyByAccount((prev) => ({ ...prev, [accountId]: busy }));
    },
  });

  return (
    <div className="mx-auto w-full flex-1 space-y-6 p-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">
          Connected calendars
        </h1>
        <p className="text-sm text-zinc-500">
          Connect Google or Outlook Calendar to look up availability. Meeting
          creation and AI meeting suggestions are coming in a later phase —
          this connects the calendar and reads busy/free time only.
        </p>
      </div>

      {connected && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Connected {connected} calendar.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <a
          href={connectGoogleCalendarUrl()}
          className="flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
        >
          <GoogleIcon /> Connect Google Calendar
        </a>
        <a
          href={connectMicrosoftCalendarUrl()}
          className="flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
        >
          <MicrosoftIcon /> Connect Outlook Calendar
        </a>
      </div>

      {isLoading && <FullPageSpinner />}

      {!isLoading && accounts?.length === 0 && (
        <EmptyState
          title="No calendars connected yet"
          description="Connect a calendar above to look up availability."
        />
      )}

      <div className="space-y-3">
        {accounts?.map((account) => (
          <div
            key={account.id}
            className="rounded-lg border border-zinc-200 bg-white p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-zinc-900">
                    {account.email}
                  </p>
                  {account.isPrimary && (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                      Primary
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500">
                  {calendarProviderLabel(account.provider)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={
                    availabilityMutation.isPending &&
                    availabilityMutation.variables === account.id
                  }
                  onClick={() => availabilityMutation.mutate(account.id)}
                >
                  Check availability (next 7 days)
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pendingId === account.id}
                  onClick={() => {
                    if (window.confirm(`Disconnect ${account.email}?`)) {
                      disconnectMutation.mutate(account.id);
                    }
                  }}
                >
                  Disconnect
                </Button>
              </div>
            </div>

            {busyByAccount[account.id] && (
              <div className="mt-3 border-t border-zinc-100 pt-3">
                {busyByAccount[account.id].length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    No busy intervals in the next 7 days.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {busyByAccount[account.id].map((interval, i) => (
                      <li key={i} className="text-xs text-zinc-600">
                        {formatDateTime(interval.start)} –{" "}
                        {formatDateTime(interval.end)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CalendarAccountsPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <CalendarAccountsContent />
    </Suspense>
  );
}
