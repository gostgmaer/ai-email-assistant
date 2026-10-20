import { useQuery } from "@tanstack/react-query";

import type { AccountMember, Integration, WorkflowAction } from "@/lib/api/types";
import {
  listSlackChannels,
  listTeamsChannels,
} from "@/lib/services/integrations.service";

type PostToSlackAction = Extract<WorkflowAction, { type: "POST_TO_SLACK" }>;

export function SlackActionFields({
  action,
  integrations,
  onChange,
}: {
  action: PostToSlackAction;
  integrations: Integration[] | undefined;
  onChange: (next: PostToSlackAction) => void;
}) {
  const slackIntegrations = integrations?.filter((i) => i.provider === "SLACK");

  const { data: channels, isLoading } = useQuery({
    queryKey: ["integration-channels", action.integrationId],
    queryFn: () => listSlackChannels(action.integrationId),
    enabled: !!action.integrationId,
  });

  return (
    <>
      <select
        value={action.integrationId}
        onChange={(e) =>
          onChange({ ...action, integrationId: e.target.value, channelId: "" })
        }
        className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
      >
        <option value="">
          {slackIntegrations?.length ? "Select workspace" : "No workspace connected"}
        </option>
        {slackIntegrations?.map((integration) => (
          <option key={integration.id} value={integration.id}>
            {integration.workspaceName ?? "Slack"}
          </option>
        ))}
      </select>
      {action.integrationId && (
        <select
          value={action.channelId}
          disabled={isLoading}
          onChange={(e) => onChange({ ...action, channelId: e.target.value })}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50"
        >
          <option value="">
            {isLoading ? "Loading channels…" : "Select channel"}
          </option>
          {channels?.map((channel) => (
            <option key={channel.id} value={channel.id}>
              #{channel.name}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

type PostToTeamsAction = Extract<WorkflowAction, { type: "POST_TO_TEAMS" }>;

/** Two-level team → channel picker — Teams doesn't have Slack's flat
 * channel list, so listTeamsChannels returns one row per (team, channel)
 * pair and this groups them by team for the first select. */
export function TeamsActionFields({
  action,
  integrations,
  onChange,
}: {
  action: PostToTeamsAction;
  integrations: Integration[] | undefined;
  onChange: (next: PostToTeamsAction) => void;
}) {
  const teamsIntegrations = integrations?.filter((i) => i.provider === "TEAMS");

  const { data: channels, isLoading } = useQuery({
    queryKey: ["integration-teams-channels", action.integrationId],
    queryFn: () => listTeamsChannels(action.integrationId),
    enabled: !!action.integrationId,
  });

  const teams = Array.from(
    new Map(channels?.map((c) => [c.teamId, c.teamName])).entries(),
  );
  const channelsForTeam = channels?.filter((c) => c.teamId === action.teamId);

  return (
    <>
      <select
        value={action.integrationId}
        onChange={(e) =>
          onChange({
            ...action,
            integrationId: e.target.value,
            teamId: "",
            channelId: "",
          })
        }
        className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
      >
        <option value="">
          {teamsIntegrations?.length ? "Select tenant" : "No tenant connected"}
        </option>
        {teamsIntegrations?.map((integration) => (
          <option key={integration.id} value={integration.id}>
            {integration.workspaceName ?? "Microsoft Teams"}
          </option>
        ))}
      </select>
      {action.integrationId && (
        <select
          value={action.teamId}
          disabled={isLoading}
          onChange={(e) =>
            onChange({ ...action, teamId: e.target.value, channelId: "" })
          }
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50"
        >
          <option value="">{isLoading ? "Loading teams…" : "Select team"}</option>
          {teams.map(([teamId, teamName]) => (
            <option key={teamId} value={teamId}>
              {teamName}
            </option>
          ))}
        </select>
      )}
      {action.teamId && (
        <select
          value={action.channelId}
          onChange={(e) => onChange({ ...action, channelId: e.target.value })}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
        >
          <option value="">Select channel</option>
          {channelsForTeam?.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

type CreateHubspotContactAction = Extract<
  WorkflowAction,
  { type: "CREATE_HUBSPOT_CONTACT" }
>;

/** Only needs an integration picker — the contact synced is always the
 * matched message's own sender, not a user-chosen value. */
export function HubspotActionFields({
  action,
  integrations,
  onChange,
}: {
  action: CreateHubspotContactAction;
  integrations: Integration[] | undefined;
  onChange: (next: CreateHubspotContactAction) => void;
}) {
  const hubspotIntegrations = integrations?.filter(
    (i) => i.provider === "HUBSPOT",
  );

  return (
    <select
      value={action.integrationId}
      onChange={(e) => onChange({ ...action, integrationId: e.target.value })}
      className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
    >
      <option value="">
        {hubspotIntegrations?.length ? "Select portal" : "No portal connected"}
      </option>
      {hubspotIntegrations?.map((integration) => (
        <option key={integration.id} value={integration.id}>
          {integration.workspaceName ?? "HubSpot"}
        </option>
      ))}
    </select>
  );
}

type ApprovalChainAction = Extract<
  WorkflowAction,
  { type: "REQUIRE_APPROVAL_CHAIN" }
>;

/** Ordered approver picker — order matters here (unlike Slack's channel
 * picker), since REQUIRE_APPROVAL_CHAIN's approverUserIds sign off in
 * sequence, not all at once. */
export function ApprovalChainActionFields({
  action,
  members,
  onChange,
}: {
  action: ApprovalChainAction;
  members: AccountMember[] | undefined;
  onChange: (next: ApprovalChainAction) => void;
}) {
  const available = members?.filter(
    (m) => !action.approverUserIds.includes(m.userId),
  );

  function memberLabel(userId: string) {
    const member = members?.find((m) => m.userId === userId);
    return member ? (member.user.displayName ?? member.user.email) : userId;
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...action.approverUserIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...action, approverUserIds: next });
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      {action.approverUserIds.length > 0 && (
        <ol className="flex flex-col gap-1">
          {action.approverUserIds.map((userId, index) => (
            <li
              key={userId}
              className="flex items-center gap-1.5 rounded-md bg-zinc-50 px-2 py-1 text-xs"
            >
              <span className="font-medium text-zinc-500">{index + 1}.</span>
              <span className="flex-1">{memberLabel(userId)}</span>
              <button
                type="button"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === action.approverUserIds.length - 1}
                onClick={() => move(index, 1)}
                className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...action,
                    approverUserIds: action.approverUserIds.filter(
                      (id) => id !== userId,
                    ),
                  })
                }
                className="text-zinc-400 hover:text-red-600"
                aria-label="Remove approver"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
      {available && available.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            onChange({
              ...action,
              approverUserIds: [...action.approverUserIds, e.target.value],
            });
          }}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
        >
          <option value="">+ Add approver</option>
          {available.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.user.displayName ?? m.user.email}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
