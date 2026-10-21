"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import type {
  NotificationChannel,
  NotificationEventPreferences,
} from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { listEmailAccounts } from "@/lib/services/email-accounts.service";
import {
  listIntegrations,
  listSlackChannels,
} from "@/lib/services/integrations.service";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/services/notifications.service";
import { updateMe } from "@/lib/services/users.service";

const CHANNELS: { channel: NotificationChannel; label: string }[] = [
  { channel: "IN_APP", label: "In app" },
  { channel: "EMAIL", label: "Email" },
  { channel: "SLACK", label: "Slack" },
];

const SELECT = "rounded-md border border-zinc-300 px-2 py-1 text-xs";

/**
 * Which events reach you where: in-app (on by default), email (sent by the
 * app, not from your own mailbox) and a Slack channel of your choice — plus
 * when the daily digest arrives.
 */
export function NotificationPreferencesSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Local edits over the saved values; null = nothing changed yet.
  const [editedRows, setRows] = useState<NotificationEventPreferences[] | null>(
    null,
  );
  const [slackAccountId, setSlackAccountId] = useState("");
  const [slackEdit, setSlackEdit] = useState<{
    integrationId: string;
    channelId: string;
  } | null>(null);
  const [digestEdit, setDigestHour] = useState<number | null>(null);

  const { data: preferences } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: getNotificationPreferences,
  });

  const rows = editedRows ?? preferences ?? [];
  const savedSlack = preferences
    ?.flatMap((p) => p.channels)
    .find((c) => c.channel === "SLACK" && c.slackIntegrationId);
  const slackIntegrationId =
    slackEdit?.integrationId ?? savedSlack?.slackIntegrationId ?? "";
  const slackChannelId =
    slackEdit?.channelId ?? savedSlack?.slackChannelId ?? "";
  const setSlackIntegrationId = (integrationId: string) =>
    setSlackEdit({ integrationId, channelId: "" });
  const setSlackChannelId = (channelId: string) =>
    setSlackEdit({ integrationId: slackIntegrationId, channelId });
  const digestHour = digestEdit ?? user?.digestHour ?? 8;

  const usesSlack = rows.some((row) =>
    row.channels.some((c) => c.channel === "SLACK" && c.enabled),
  );

  const { data: accounts } = useQuery({
    queryKey: ["email-accounts"],
    queryFn: listEmailAccounts,
    enabled: usesSlack,
  });
  const { data: integrations } = useQuery({
    queryKey: ["integrations", slackAccountId],
    queryFn: () => listIntegrations(slackAccountId),
    enabled: usesSlack && !!slackAccountId,
  });
  const { data: channels } = useQuery({
    queryKey: ["integration-channels", slackIntegrationId],
    queryFn: () => listSlackChannels(slackIntegrationId),
    enabled: usesSlack && !!slackIntegrationId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      await updateNotificationPreferences(
        rows.flatMap((row) =>
          row.channels.map((c) => ({
            event: row.event,
            channel: c.channel,
            enabled: c.enabled,
            ...(c.channel === "SLACK" && c.enabled
              ? { slackIntegrationId, slackChannelId }
              : {}),
          })),
        ),
      );
      if (digestHour !== user?.digestHour) {
        await updateMe({ digestHour });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["notification-preferences"],
      });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  function toggle(eventIndex: number, channel: NotificationChannel) {
    setRows(
      rows.map((row, i) =>
        i === eventIndex
          ? {
              ...row,
              channels: row.channels.map((c) =>
                c.channel === channel ? { ...c, enabled: !c.enabled } : c,
              ),
            }
          : row,
      ),
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-900">Notifications</h2>
      <p className="text-xs text-zinc-500">
        Choose where each kind of notification reaches you. Email comes from
        the app, not from your own mailbox.
      </p>

      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr className="text-left text-zinc-500">
              <th className="py-1 pr-4 font-medium">When…</th>
              {CHANNELS.map(({ channel, label }) => (
                <th key={channel} className="px-3 py-1 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.event} className="border-t border-zinc-100">
                <td className="py-1.5 pr-4 text-zinc-700">{row.label}</td>
                {CHANNELS.map(({ channel }) => (
                  <td key={channel} className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${row.label}: ${channel}`}
                      checked={
                        row.channels.find((c) => c.channel === channel)
                          ?.enabled ?? false
                      }
                      onChange={() => toggle(i, channel)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {usesSlack && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
          <span>Post to Slack via</span>
          <select
            value={slackAccountId}
            onChange={(e) => {
              setSlackAccountId(e.target.value);
              setSlackIntegrationId("");
            }}
            className={SELECT}
          >
            <option value="">
              {slackIntegrationId ? "(keep current workspace)" : "Select mailbox"}
            </option>
            {accounts?.map((account) => (
              <option key={account.id} value={account.id}>
                {account.email}
              </option>
            ))}
          </select>
          {slackAccountId && (
            <select
              value={slackIntegrationId}
              onChange={(e) => setSlackIntegrationId(e.target.value)}
              className={SELECT}
            >
              <option value="">Select workspace</option>
              {integrations
                ?.filter((i) => i.provider === "SLACK")
                .map((integration) => (
                  <option key={integration.id} value={integration.id}>
                    {integration.workspaceName ?? "Slack"}
                  </option>
                ))}
            </select>
          )}
          {slackIntegrationId && (
            <select
              value={slackChannelId}
              onChange={(e) => setSlackChannelId(e.target.value)}
              className={SELECT}
            >
              <option value="">Select channel</option>
              {channels?.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  #{channel.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-zinc-600">
        Send the daily digest at
        <select
          value={digestHour}
          onChange={(e) => setDigestHour(Number(e.target.value))}
          className={SELECT}
        >
          {Array.from({ length: 24 }, (_, hour) => (
            <option key={hour} value={hour}>
              {String(hour).padStart(2, "0")}:00
            </option>
          ))}
        </select>
        your time ({user?.timezone ?? "UTC"})
      </label>

      {saveMutation.isError && (
        <p className="text-xs text-red-600">
          {saveMutation.error instanceof Error
            ? saveMutation.error.message
            : "Could not save"}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          disabled={usesSlack && (!slackIntegrationId || !slackChannelId)}
        >
          Save notifications
        </Button>
        {saveMutation.isSuccess && (
          <span className="text-xs text-emerald-600">Saved</span>
        )}
      </div>
    </section>
  );
}
