import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../database';
import { EncryptionService } from '../../../infrastructure/encryption';
import { IntegrationModel } from '../../../generated/prisma/models';
// Leaf-file import — see documents.controller.ts's comment for why
// (avoids a Jest-only circular require).
import { EmailAccountService } from '../../email-account/services/email-account.service';
import { SlackChannel } from '../interfaces';
import { SlackService } from './slack.service';

type SafeIntegration = Omit<IntegrationModel, 'accessToken'>;

function toSafeIntegration(integration: IntegrationModel): SafeIntegration {
  return {
    id: integration.id,
    accountId: integration.accountId,
    provider: integration.provider,
    workspaceId: integration.workspaceId,
    workspaceName: integration.workspaceName,
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

    const encryptedAccessToken = this.encryptionService.encrypt(accessToken);

    const integration = await this.prisma.integration.upsert({
      where: { accountId_provider: { accountId, provider: 'SLACK' } },
      create: {
        accountId,
        provider: 'SLACK',
        workspaceId,
        workspaceName,
        accessToken: encryptedAccessToken,
      },
      update: {
        workspaceId,
        workspaceName,
        accessToken: encryptedAccessToken,
        deletedAt: null,
      },
    });

    return toSafeIntegration(integration);
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

    const accessToken = this.encryptionService.decrypt(integration.accessToken);
    return this.slackService.listChannels(accessToken);
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
    const integration = await this.prisma.integration.findUnique({
      where: { id: integrationId },
    });

    if (!integration || integration.deletedAt) {
      throw new NotFoundException('Integration not found');
    }

    const accessToken = this.encryptionService.decrypt(integration.accessToken);
    await this.slackService.postMessage(accessToken, channelId, text);
  }

  private async getOwnedIntegrationOrThrow(
    userId: string,
    integrationId: string,
  ): Promise<IntegrationModel> {
    const integration = await this.prisma.integration.findUnique({
      where: { id: integrationId },
    });

    if (!integration || integration.deletedAt) {
      throw new NotFoundException('Integration not found');
    }

    await this.emailAccountService.getOwnedAccountOrThrow(
      userId,
      integration.accountId,
    );

    return integration;
  }
}
