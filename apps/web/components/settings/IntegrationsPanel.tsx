import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { HubSpotIcon, SlackIcon, TeamsIcon } from "@/components/icons";
import type { Integration } from "@/lib/api/types";
import {
  connectHubspotUrl,
  connectSlackUrl,
  connectTeamsUrl,
  disconnectIntegration,
  listIntegrations,
} from "@/lib/services/integrations.service";

const INTEGRATION_LABEL: Record<Integration["provider"], string> = {
  SLACK: "Slack",
  TEAMS: "Microsoft Teams",
  HUBSPOT: "HubSpot",
};

function IntegrationProviderIcon({ provider }: { provider: Integration["provider"] }) {
  switch (provider) {
    case "SLACK":
      return <SlackIcon />;
    case "TEAMS":
      return <TeamsIcon />;
    case "HUBSPOT":
      return <HubSpotIcon />;
  }
}

export function IntegrationsPanel({
  accountId,
  isOwner,
}: {
  accountId: string;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();

  const { data: integrations, isLoading } = useQuery({
    queryKey: ["integrations", accountId],
    queryFn: () => listIntegrations(accountId),
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectIntegration,
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["integrations", accountId],
      }),
  });

  const connected = new Set(integrations?.map((i) => i.provider));

  const CONNECT_OPTIONS: {
    provider: Integration["provider"];
    label: string;
    href: string;
  }[] = [
    { provider: "SLACK", label: "Connect Slack", href: connectSlackUrl(accountId) },
    { provider: "TEAMS", label: "Connect Teams", href: connectTeamsUrl(accountId) },
    {
      provider: "HUBSPOT",
      label: "Connect HubSpot",
      href: connectHubspotUrl(accountId),
    },
  ];

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <p className="mb-2 text-xs text-zinc-500">
        Connect a workspace/tenant/portal here, then reference it from a
        workflow action above — post to a Slack or Teams channel, or sync
        the sender to HubSpot, whenever a rule matches.
      </p>

      {isLoading && (
        <p className="text-xs text-zinc-400">Loading integrations…</p>
      )}

      <ul className="mb-3 space-y-2">
        {integrations?.map((integration) => (
          <li
            key={integration.id}
            className="flex items-center justify-between rounded-md border border-zinc-200 p-3"
          >
            <div className="flex items-center gap-2">
              <IntegrationProviderIcon provider={integration.provider} />
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  {integration.workspaceName ??
                    INTEGRATION_LABEL[integration.provider]}
                </p>
                <p className="text-xs text-zinc-500">
                  {INTEGRATION_LABEL[integration.provider]}
                </p>
              </div>
            </div>
            {isOwner && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => disconnectMutation.mutate(integration.id)}
                loading={
                  disconnectMutation.isPending &&
                  disconnectMutation.variables === integration.id
                }
              >
                Disconnect
              </Button>
            )}
          </li>
        ))}
        {integrations?.length === 0 && !isLoading && (
          <li className="text-xs text-zinc-400">No integrations connected yet.</li>
        )}
      </ul>

      {isOwner && (
        <div className="flex flex-wrap gap-2">
          {CONNECT_OPTIONS.filter((o) => !connected.has(o.provider)).map(
            (option) => (
              <a
                key={option.provider}
                href={option.href}
                className="flex w-fit items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
              >
                <IntegrationProviderIcon provider={option.provider} />
                {option.label}
              </a>
            ),
          )}
        </div>
      )}
    </div>
  );
}
