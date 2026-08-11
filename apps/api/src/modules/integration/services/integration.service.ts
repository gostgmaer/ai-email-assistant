import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../database';
import { EncryptionService } from '../../../infrastructure/encryption';
import { IntegrationModel } from '../../../generated/prisma/models';
// Leaf-file import — see documents.controller.ts's comment for why
// (avoids a Jest-only circular require).
import { EmailAccountService } from '../../email-account/services/email-account.service';
import { HubspotContactInput, SlackChannel, TeamsChannel } from '../interfaces';
import { HubspotService } from './hubspot.service';
import { SlackService } from './slack.service';
import { TeamsService } from './teams.service';

type SafeIntegration = Omit<IntegrationModel, 'accessToken' | 'refreshToken'>;

function toSafeIntegration(integration: IntegrationModel): SafeIntegration {
  return {
    id: integration.id,
    accountId: integration.accountId,
    provider: integration.provider,
    workspaceId: integration.workspaceId,
    workspaceName: integration.workspaceName,
    expiresAt: integration.expiresAt,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
    deletedAt: integration.deletedAt,
  };
}

@Injectable()
export class IntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly emailAccountService: EmailAccountService,
    private readonly slackService: SlackService,
    private readonly teamsService: TeamsService,
    private readonly hubspotService: HubspotService,
  ) {}

  /** Owner-only, same tier as WorkflowRule/Agent — an integration is
   * account configuration, not something Shared Inbox members manage. */
  async listForAccount(
    userId: string,
    accountId: string,
  ): Promise<SafeIntegration[]> {
    await this.emailAccountService.getOwnedAccountOrThrow(userId, accountId);

    const integrations = await this.prisma.integration.findMany({
      where: { accountId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    return integrations.map(toSafeIntegration);
  }

  async connectSlack(
    accountId: string,
    code: string,
  ): Promise<SafeIntegration> {
    const { accessToken, workspaceId, workspaceName } =
      await this.slackService.exchangeCode(code);

    return this.upsertIntegration(accountId, 'SLACK', {
      accessToken,
      workspaceId,
      workspaceName,
    });
  }

  async connectTeams(
    accountId: string,
    code: string,
  ): Promise<SafeIntegration> {
    const { accessToken, refreshToken, expiresAt, tenantId, organizationName } =
      await this.teamsService.exchangeCode(code);

    return this.upsertIntegration(accountId, 'TEAMS', {
      accessToken,
      refreshToken,
      expiresAt,
      workspaceId: tenantId,
      workspaceName: organizationName,
    });
  }

  async connectHubspot(
    accountId: string,
    code: string,
  ): Promise<SafeIntegration> {
    const { accessToken, refreshToken, expiresAt, hubId, accountName } =
      await this.hubspotService.exchangeCode(code);

    return this.upsertIntegration(accountId, 'HUBSPOT', {
      accessToken,
      refreshToken,
      expiresAt,
      workspaceId: hubId,
      workspaceName: accountName,
    });
  }

  async disconnect(userId: string, integrationId: string): Promise<void> {
    const integration = await this.getOwnedIntegrationOrThrow(
      userId,
      integrationId,
    );

    await this.prisma.integration.update({
      where: { id: integration.id },
      data: { deletedAt: new Date() },
    });
  }

  async listChannels(
    userId: string,
    integrationId: string,
  ): Promise<SlackChannel[]> {
    const integration = await this.getOwnedIntegrationOrThrow(
      userId,
      integrationId,
    );
    const accessToken = await this.getValidAccessToken(integration);
    return this.slackService.listChannels(accessToken);
  }

  async listTeamsChannels(
    userId: string,
    integrationId: string,
  ): Promise<TeamsChannel[]> {
    const integration = await this.getOwnedIntegrationOrThrow(
      userId,
      integrationId,
    );
    const accessToken = await this.getValidAccessToken(integration);
    return this.teamsService.listTeamsAndChannels(accessToken);
  }

  /** Called by WorkflowRuleService's POST_TO_SLACK action — no ownership
   * check here (a workflow rule already ran an owner-only create/update
   * check when the action was saved), matching how EmailAccountService's
   * getValidAccessToken is called mid-pipeline without one either. */
  async postMessage(
    integrationId: string,
    channelId: string,
    text: string,
  ): Promise<void> {
    const integration = await this.getIntegrationOrThrow(integrationId);
    const accessToken = await this.getValidAccessToken(integration);
    await this.slackService.postMessage(accessToken, channelId, text);
  }

  /** Called by WorkflowRuleService's POST_TO_TEAMS action — same posture
   * as postMessage above. */
  async postToTeamsChannel(
    integrationId: string,
    teamId: string,
    channelId: string,
    text: string,
  ): Promise<void> {
    const integration = await this.getIntegrationOrThrow(integrationId);
    const accessToken = await this.getValidAccessToken(integration);
    await this.teamsService.postMessage(accessToken, teamId, channelId, text);
  }

  /** Called by WorkflowRuleService's CREATE_HUBSPOT_CONTACT action — same
   * posture as postMessage above. */
  async upsertHubspotContact(
    integrationId: string,
    contact: HubspotContactInput,
  ): Promise<void> {
    const integration = await this.getIntegrationOrThrow(integrationId);
    const accessToken = await this.getValidAccessToken(integration);
    await this.hubspotService.upsertContact(accessToken, contact);
  }

  private async upsertIntegration(
    accountId: string,
    provider: 'SLACK' | 'TEAMS' | 'HUBSPOT',
    data: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date;
      workspaceId?: string;
      workspaceName?: string;
    },
  ): Promise<SafeIntegration> {
    const encryptedAccessToken = this.encryptionService.encrypt(
      data.accessToken,
    );
    const encryptedRefreshToken = data.refreshToken
      ? this.encryptionService.encrypt(data.refreshToken)
      : undefined;

    const integration = await this.prisma.integration.upsert({
      where: { accountId_provider: { accountId, provider } },
      create: {
        accountId,
        provider,
        workspaceId: data.workspaceId,
        workspaceName: data.workspaceName,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: data.expiresAt,
      },
      update: {
        workspaceId: data.workspaceId,
        workspaceName: data.workspaceName,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: data.expiresAt,
        deletedAt: null,
      },
    });

    return toSafeIntegration(integration);
  }

  /** Decrypted, refreshed-if-needed access token — mirrors
   * EmailAccountService.getValidAccessToken's shape. Slack's bot tokens
   * never expire (expiresAt stays null), so this is a plain decrypt for
   * SLACK and a real refresh for TEAMS/HUBSPOT. */
  private async getValidAccessToken(
    integration: IntegrationModel,
  ): Promise<string> {
    if (!integration.expiresAt) {
      return this.encryptionService.decrypt(integration.accessToken);
    }

    const isExpiringSoon =
      integration.expiresAt.getTime() - Date.now() < 60_000;

    if (!isExpiringSoon) {
      return this.encryptionService.decrypt(integration.accessToken);
    }

    if (!integration.refreshToken) {
      throw new BadRequestException(
        'Access token expired and no refresh token is stored; reconnect this integration',
      );
    }

    const refreshToken = this.encryptionService.decrypt(
      integration.refreshToken,
    );

    const refreshed =
      integration.provider === 'TEAMS'
        ? await this.teamsService.refreshAccessToken(refreshToken)
        : await this.hubspotService.refreshAccessToken(refreshToken);

    await this.prisma.integration.update({
      where: { id: integration.id },
      data: {
        accessToken: this.encryptionService.encrypt(refreshed.accessToken),
        refreshToken: this.encryptionService.encrypt(refreshed.refreshToken),
        expiresAt: refreshed.expiresAt,
      },
    });

    return refreshed.accessToken;
  }

  private async getIntegrationOrThrow(
    integrationId: string,
  ): Promise<IntegrationModel> {
    const integration = await this.prisma.integration.findUnique({
      where: { id: integrationId },
    });

    if (!integration || integration.deletedAt) {
      throw new NotFoundException('Integration not found');
    }

    return integration;
  }

  private async getOwnedIntegrationOrThrow(
    userId: string,
    integrationId: string,
  ): Promise<IntegrationModel> {
    const integration = await this.getIntegrationOrThrow(integrationId);

    await this.emailAccountService.getOwnedAccountOrThrow(
      userId,
      integration.accountId,
    );

    return integration;
  }
}
