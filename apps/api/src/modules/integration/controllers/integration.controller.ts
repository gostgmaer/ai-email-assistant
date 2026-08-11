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
import { IntegrationConnectStateService } from '../services/integration-connect-state.service';
import { IntegrationService } from '../services/integration.service';
import { SlackService } from '../services/slack.service';

@ApiTags('integrations')
@ApiBearerAuth('access-token')
@Controller('integrations')
export class IntegrationController {
  constructor(
    private readonly integrationService: IntegrationService,
    private readonly slackService: SlackService,
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
    // flow) rather than letting an unowned accountId ride through Slack's
    // redirect and only fail on the way back.
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
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    const { accountId } = await this.connectStateService.verifyState(
      state,
      'SLACK',
    );

    await this.integrationService.connectSlack(accountId, code);

    // No standalone /settings/integrations page — integrations are managed
    // inline per-account on EmailAccountCard, same as Workflows/Agents, so
    // this redirects back there (matching Google/Microsoft's own connect
    // callback redirect target).
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const redirectUrl = new URL('/settings/email-accounts', frontendUrl);
    redirectUrl.searchParams.set('connected', 'slack');
    redirectUrl.searchParams.set('accountId', accountId);

    res.redirect(redirectUrl.toString());
  }

  @Get(':id/channels')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List Slack channels the bot can post to' })
  @ApiResponse({ status: 200, description: 'The channel list' })
  async listChannels(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.integrationService.listChannels(user.sub, id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Disconnect an integration' })
  @ApiResponse({ status: 200, description: 'The integration was disconnected' })
  async disconnect(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.integrationService.disconnect(user.sub, id);
    return { success: true };
  }
}
