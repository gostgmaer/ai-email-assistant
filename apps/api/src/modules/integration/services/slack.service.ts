import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SlackChannel, SlackConnectResult } from '../interfaces';

// chat:write to post, channels:read/groups:read to populate the channel
// picker in the Workflow rule builder (public + private channels the bot
// has been added to).
const SLACK_BOT_SCOPES = ['chat:write', 'channels:read', 'groups:read'];

interface SlackOAuthAccessResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { id?: string; name?: string };
}

interface SlackConversationsListResponse {
  ok: boolean;
  error?: string;
  channels?: { id: string; name: string }[];
}

interface SlackPostMessageResponse {
  ok: boolean;
  error?: string;
}

/**
 * Thin wrapper around Slack's Web API. No passport strategy here — Slack's
 * OAuth v2 flow is two plain HTTP calls (build an authorize URL, POST the
 * code for a token), and passport-slack isn't a well-maintained package
 * worth taking on as a dependency for that.
 */
@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  constructor(private readonly configService: ConfigService) {}

  private requireConfig(
    key: 'SLACK_CLIENT_ID' | 'SLACK_CLIENT_SECRET' | 'SLACK_CALLBACK_URL',
  ): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new BadRequestException(
        `Slack integration is not configured on this server (missing ${key})`,
      );
    }
    return value;
  }

  buildAuthorizeUrl(state: string): string {
    const url = new URL('https://slack.com/oauth/v2/authorize');
    url.searchParams.set('client_id', this.requireConfig('SLACK_CLIENT_ID'));
    url.searchParams.set('scope', SLACK_BOT_SCOPES.join(','));
    url.searchParams.set(
      'redirect_uri',
      this.requireConfig('SLACK_CALLBACK_URL'),
    );
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(code: string): Promise<SlackConnectResult> {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.requireConfig('SLACK_CLIENT_ID'),
        client_secret: this.requireConfig('SLACK_CLIENT_SECRET'),
        code,
        redirect_uri: this.requireConfig('SLACK_CALLBACK_URL'),
      }),
    });

    const data = (await response.json()) as SlackOAuthAccessResponse;

    if (!data.ok || !data.access_token) {
      throw new BadRequestException(
        `Slack authorization failed: ${data.error ?? 'unknown error'}`,
      );
    }

    return {
      accessToken: data.access_token,
      workspaceId: data.team?.id,
      workspaceName: data.team?.name,
    };
  }

  async listChannels(accessToken: string): Promise<SlackChannel[]> {
    const url = new URL('https://slack.com/api/conversations.list');
    url.searchParams.set('types', 'public_channel,private_channel');
    url.searchParams.set('exclude_archived', 'true');
    url.searchParams.set('limit', '200');

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = (await response.json()) as SlackConversationsListResponse;

    if (!data.ok) {
      throw new BadRequestException(
        `Slack API error: ${data.error ?? 'unknown error'}`,
      );
    }

    return (data.channels ?? []).map((channel) => ({
      id: channel.id,
      name: channel.name,
    }));
  }

  /** Best-effort by design — see WorkflowRuleService.executeActions, which
   * catches and logs rather than letting a Slack failure block the rest
   * of a rule's actions or the reply pipeline. */
  async postMessage(
    accessToken: string,
    channelId: string,
    text: string,
  ): Promise<void> {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: channelId, text }),
    });

    const data = (await response.json()) as SlackPostMessageResponse;

    if (!data.ok) {
      throw new Error(
        `Slack postMessage failed: ${data.error ?? 'unknown error'}`,
      );
    }

    this.logger.debug(`Posted to Slack channel ${channelId}`);
  }
}
