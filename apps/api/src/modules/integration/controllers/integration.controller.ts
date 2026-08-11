import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';

// Leaf-file imports — see documents.controller.ts's comment for why
// (avoids a Jest-only circular require).
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { EmailAccountService } from '../../email-account/services/email-account.service';
import { HubspotService } from '../services/hubspot.service';
import { IntegrationConnectStateService } from '../services/integration-connect-state.service';
import { IntegrationService } from '../services/integration.service';
import { SlackService } from '../services/slack.service';
import { TeamsService } from '../services/teams.service';

@ApiTags('integrations')
@ApiBearerAuth('access-token')
@Controller('integrations')
export class IntegrationController {
  constructor(
    private readonly integrationService: IntegrationService,
    private readonly slackService: SlackService,
    private readonly teamsService: TeamsService,
    private readonly hubspotService: HubspotService,
    private readonly connectStateService: IntegrationConnectStateService,
    private readonly emailAccountService: EmailAccountService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List integrations connected to an account' })
  @ApiResponse({ status: 200, description: 'The connected integrations' })
  async list(
    @CurrentUser() user: JwtPayload,
    @Query('accountId') accountId: string,
  ) {
    return this.integrationService.listForAccount(user.sub, accountId);
  }

  @Get('connect/slack')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Start connecting a Slack workspace' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to Slack consent screen',
  })
  async connectSlack(
    @CurrentUser() user: JwtPayload,
    @Query('accountId') accountId: string,
    @Res() res: Response,
  ): Promise<void> {
    // Fails fast (owner-only, matches every other account-scoped connect
    // flow) rather than letting an unowned accountId ride through the
    // provider's redirect and only fail on the way back.
    await this.emailAccountService.getOwnedAccountOrThrow(user.sub, accountId);

    const state = await this.connectStateService.createState(
      'SLACK',
      user.sub,
      accountId,
    );

    res.redirect(this.slackService.buildAuthorizeUrl(state));
  }

  @Get('connect/slack/callback')
  @ApiOperation({ summary: 'Slack connect OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirects back to the frontend' })
  async connectSlackCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { accountId } = await this.verifyCallback(req, 'SLACK');
    await this.integrationService.connectSlack(accountId, this.codeFrom(req));
    this.redirectToAccount(res, 'slack', accountId);
  }

  @Get('connect/teams')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Start connecting a Microsoft Teams tenant' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to the Microsoft consent screen',
  })
  async connectTeams(
    @CurrentUser() user: JwtPayload,
    @Query('accountId') accountId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.emailAccountService.getOwnedAccountOrThrow(user.sub, accountId);

    const state = await this.connectStateService.createState(
      'TEAMS',
      user.sub,
      accountId,
    );

    res.redirect(this.teamsService.buildAuthorizeUrl(state));
  }

  @Get('connect/teams/callback')
  @ApiOperation({ summary: 'Microsoft Teams connect OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirects back to the frontend' })
  async connectTeamsCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { accountId } = await this.verifyCallback(req, 'TEAMS');
    await this.integrationService.connectTeams(accountId, this.codeFrom(req));
    this.redirectToAccount(res, 'teams', accountId);
  }

  @Get('connect/hubspot')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Start connecting a HubSpot portal' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to the HubSpot consent screen',
  })
  async connectHubspot(
    @CurrentUser() user: JwtPayload,
    @Query('accountId') accountId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.emailAccountService.getOwnedAccountOrThrow(user.sub, accountId);

    const state = await this.connectStateService.createState(
      'HUBSPOT',
      user.sub,
      accountId,
    );

    res.redirect(this.hubspotService.buildAuthorizeUrl(state));
  }

  @Get('connect/hubspot/callback')
  @ApiOperation({ summary: 'HubSpot connect OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirects back to the frontend' })
  async connectHubspotCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { accountId } = await this.verifyCallback(req, 'HUBSPOT');
    await this.integrationService.connectHubspot(accountId, this.codeFrom(req));
    this.redirectToAccount(res, 'hubspot', accountId);
  }

  @Get(':id/channels')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List Slack channels the bot can post to' })
  @ApiResponse({ status: 200, description: 'The channel list' })
  async listChannels(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.integrationService.listChannels(user.sub, id);
  }

  @Get(':id/teams-channels')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'List Microsoft Teams channels this user can post to',
  })
  @ApiResponse({ status: 200, description: 'The team/channel list' })
  async listTeamsChannels(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.integrationService.listTeamsChannels(user.sub, id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Disconnect an integration' })
  @ApiResponse({ status: 200, description: 'The integration was disconnected' })
  async disconnect(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.integrationService.disconnect(user.sub, id);
    return { success: true };
  }

  private codeFrom(req: Request): string {
    return typeof req.query.code === 'string' ? req.query.code : '';
  }

  private async verifyCallback(
    req: Request,
    provider: 'SLACK' | 'TEAMS' | 'HUBSPOT',
  ): Promise<{ accountId: string }> {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    return this.connectStateService.verifyState(state, provider);
  }

  // No standalone /settings/integrations page — integrations are managed
  // inline per-account on EmailAccountCard, same as Workflows/Agents, so
  // every connect callback redirects back there (matching Google/
  // Microsoft's own connect callback redirect target).
  private redirectToAccount(
    res: Response,
    connectedProvider: string,
    accountId: string,
  ): void {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const redirectUrl = new URL('/settings/email-accounts', frontendUrl);
    redirectUrl.searchParams.set('connected', connectedProvider);
    redirectUrl.searchParams.set('accountId', accountId);
    res.redirect(redirectUrl.toString());
  }
}
