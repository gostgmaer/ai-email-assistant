import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { HubspotConnectResult, HubspotContactInput } from '../interfaces';

const HUBSPOT_SCOPES = [
  'crm.objects.contacts.write',
  'crm.objects.contacts.read',
];

const AUTHORIZE_URL = 'https://app.hubspot.com/oauth/authorize';
const TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token';

interface HubspotOAuthTokenResponse {
  status?: string;
  message?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

interface HubspotAccessTokenInfoResponse {
  hub_id?: number;
  hub_domain?: string;
}

/**
 * Thin wrapper around HubSpot's OAuth + CRM APIs, mirroring SlackService.
 * Unlike Slack's long-lived bot token, HubSpot access tokens expire in
 * ~30 minutes, so refreshAccessToken is a real, regularly-used path (see
 * IntegrationService.getValidAccessToken).
 */
@Injectable()
export class HubspotService {
  private readonly logger = new Logger(HubspotService.name);

  constructor(private readonly configService: ConfigService) {}

  private requireConfig(
    key: 'HUBSPOT_CLIENT_ID' | 'HUBSPOT_CLIENT_SECRET' | 'HUBSPOT_CALLBACK_URL',
  ): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new BadRequestException(
        `HubSpot integration is not configured on this server (missing ${key})`,
      );
    }
    return value;
  }

  buildAuthorizeUrl(state: string): string {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', this.requireConfig('HUBSPOT_CLIENT_ID'));
    url.searchParams.set(
      'redirect_uri',
      this.requireConfig('HUBSPOT_CALLBACK_URL'),
    );
    url.searchParams.set('scope', HUBSPOT_SCOPES.join(' '));
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(code: string): Promise<HubspotConnectResult> {
    const tokens = await this.requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.requireConfig('HUBSPOT_CALLBACK_URL'),
    });

    const info = await this.getAccessTokenInfo(tokens.access_token);

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in ?? 1800) * 1000),
      hubId: info.hub_id ? String(info.hub_id) : undefined,
      accountName: info.hub_domain,
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
      // HubSpot always returns a refresh_token on refresh too, but fall
      // back the same defensive way as TeamsService just in case.
      refreshToken: tokens.refresh_token ?? refreshToken,
      expiresAt: new Date(Date.now() + (tokens.expires_in ?? 1800) * 1000),
    };
  }

  /** True upsert (create-or-update, keyed on email) via HubSpot's batch
   * upsert endpoint — best-effort by design, see
   * WorkflowRuleService.executeActions. */
  async upsertContact(
    accessToken: string,
    contact: HubspotContactInput,
  ): Promise<void> {
    const response = await fetch(
      'https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: [
            {
              idProperty: 'email',
              id: contact.email,
              properties: {
                email: contact.email,
                ...(contact.firstName ? { firstname: contact.firstName } : {}),
                ...(contact.lastName ? { lastname: contact.lastName } : {}),
              },
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      throw new Error(
        `HubSpot upsertContact failed: ${data.message ?? response.statusText}`,
      );
    }

    this.logger.debug(`Upserted HubSpot contact ${contact.email}`);
  }

  private async getAccessTokenInfo(
    accessToken: string,
  ): Promise<HubspotAccessTokenInfoResponse> {
    const response = await fetch(
      `https://api.hubapi.com/oauth/v1/access-tokens/${accessToken}`,
    );
    if (!response.ok) {
      return {};
    }
    return (await response.json()) as HubspotAccessTokenInfoResponse;
  }

  private async requestToken(
    params: Record<string, string>,
  ): Promise<HubspotOAuthTokenResponse> {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.requireConfig('HUBSPOT_CLIENT_ID'),
        client_secret: this.requireConfig('HUBSPOT_CLIENT_SECRET'),
        ...params,
      }),
    });

    const data = (await response.json()) as HubspotOAuthTokenResponse;

    if (!response.ok || !data.access_token) {
      throw new BadRequestException(
        `HubSpot authorization failed: ${data.message ?? 'unknown error'}`,
      );
    }

    return data;
  }
}
