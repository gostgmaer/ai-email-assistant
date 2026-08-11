import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { TeamsChannel, TeamsConnectResult } from '../interfaces';

// offline_access for the refresh token (Graph access tokens are short-
// lived, ~1hr); Team/Channel.ReadBasic.All to populate the team/channel
// picker; ChannelMessage.Send to actually post; User.Read (basic profile)
// to label the connection without needing admin-consentable scopes like
// Organization.Read.All.
const TEAMS_SCOPES = [
  'offline_access',
  'Team.ReadBasic.All',
  'Channel.ReadBasic.All',
  'ChannelMessage.Send',
  'User.Read',
];

const AUTHORIZE_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

interface GraphOAuthTokenResponse {
  error?: string;
  error_description?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

interface GraphMeResponse {
  userPrincipalName?: string;
  displayName?: string;
}

interface GraphTeam {
  id: string;
  displayName: string;
}

interface GraphChannel {
  id: string;
  displayName: string;
}

/**
 * Thin wrapper around Microsoft Graph's Teams API, mirroring SlackService.
 * Reuses the same Azure AD app registration as email/calendar Microsoft
 * OAuth (MICROSOFT_CLIENT_ID/SECRET) — Teams just needs its own redirect
 * URI and a different scope set requested at connect time, not a separate
 * app. Manual OAuth (not passport-microsoft) for the same reason
 * SlackService is manual: this is two plain HTTP calls, and the existing
 * MicrosoftConnectStrategy is shaped specifically for mailbox profiles.
 */
@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(private readonly configService: ConfigService) {}

  private requireConfig(
    key:
      | 'MICROSOFT_CLIENT_ID'
      | 'MICROSOFT_CLIENT_SECRET'
      | 'MICROSOFT_TEAMS_CALLBACK_URL',
  ): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new BadRequestException(
        `Microsoft Teams integration is not configured on this server (missing ${key})`,
      );
    }
    return value;
  }

  buildAuthorizeUrl(state: string): string {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set(
      'client_id',
      this.requireConfig('MICROSOFT_CLIENT_ID'),
    );
    url.searchParams.set('response_type', 'code');
    url.searchParams.set(
      'redirect_uri',
      this.requireConfig('MICROSOFT_TEAMS_CALLBACK_URL'),
    );
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('scope', TEAMS_SCOPES.join(' '));
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(code: string): Promise<TeamsConnectResult> {
    const tokens = await this.requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.requireConfig('MICROSOFT_TEAMS_CALLBACK_URL'),
    });

    const profile = await this.getProfile(tokens.access_token);
    const tenantDomain = profile.userPrincipalName?.split('@')[1];

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
      tenantId: tenantDomain,
      organizationName: tenantDomain,
    };
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
    const tokens = await this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    return {
      accessToken: tokens.access_token,
      // Microsoft rotates refresh tokens; fall back to the old one on the
      // rare response that omits a new one, matching
      // EmailAccountService.getValidAccessToken's same fallback for Google.
      refreshToken: tokens.refresh_token ?? refreshToken,
      expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
    };
  }

  async listTeamsAndChannels(accessToken: string): Promise<TeamsChannel[]> {
    const teamsResponse = await fetch(`${GRAPH_BASE}/me/joinedTeams`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const teamsData = (await teamsResponse.json()) as {
      value?: GraphTeam[];
      error?: { message?: string };
    };

    if (!teamsResponse.ok) {
      throw new BadRequestException(
        `Microsoft Graph error: ${teamsData.error?.message ?? 'unknown error'}`,
      );
    }

    const teams = teamsData.value ?? [];

    const channelsByTeam = await Promise.all(
      teams.map(async (team) => {
        const response = await fetch(
          `${GRAPH_BASE}/teams/${team.id}/channels`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        const data = (await response.json()) as { value?: GraphChannel[] };
        if (!response.ok) {
          this.logger.warn(`Failed to list channels for Team ${team.id}`);
          return [];
        }
        return (data.value ?? []).map((channel): TeamsChannel => ({
          teamId: team.id,
          teamName: team.displayName,
          id: channel.id,
          name: channel.displayName,
        }));
      }),
    );

    return channelsByTeam.flat();
  }

  /** Best-effort by design — see WorkflowRuleService.executeActions. */
  async postMessage(
    accessToken: string,
    teamId: string,
    channelId: string,
    text: string,
  ): Promise<void> {
    const response = await fetch(
      `${GRAPH_BASE}/teams/${teamId}/channels/${channelId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: { content: text } }),
      },
    );

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new Error(
        `Teams postMessage failed: ${data.error?.message ?? response.statusText}`,
      );
    }

    this.logger.debug(`Posted to Teams channel ${channelId} (team ${teamId})`);
  }

  private async getProfile(accessToken: string): Promise<GraphMeResponse> {
    const response = await fetch(`${GRAPH_BASE}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      return {};
    }
    return (await response.json()) as GraphMeResponse;
  }

  private async requestToken(
    params: Record<string, string>,
  ): Promise<GraphOAuthTokenResponse> {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.requireConfig('MICROSOFT_CLIENT_ID'),
        client_secret: this.requireConfig('MICROSOFT_CLIENT_SECRET'),
        scope: TEAMS_SCOPES.join(' '),
        ...params,
      }),
    });

    const data = (await response.json()) as GraphOAuthTokenResponse;

    if (!response.ok || !data.access_token) {
      throw new BadRequestException(
        `Microsoft Teams authorization failed: ${data.error_description ?? data.error ?? 'unknown error'}`,
      );
    }

    return data;
  }
}
