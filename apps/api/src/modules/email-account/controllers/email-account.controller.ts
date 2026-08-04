import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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

import { QueueService } from '../../../infrastructure/queue';
import { CurrentUser, JwtAuthGuard, JwtPayload } from '../../auth';
import { ConnectImapDto, UpdateEmailAccountDto } from '../dto';
import { GoogleConnectGuard } from '../guards/google-connect.guard';
import { MicrosoftConnectGuard } from '../guards/microsoft-connect.guard';
import { MailConnectResult } from '../interfaces';
import { EmailAccountService } from '../services/email-account.service';

@ApiTags('email-accounts')
@ApiBearerAuth('access-token')
@Controller('email-accounts')
export class EmailAccountController {
  constructor(
    private readonly emailAccountService: EmailAccountService,
    private readonly configService: ConfigService,
    private readonly queueService: QueueService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List connected email accounts' })
  @ApiResponse({ status: 200, description: 'The connected accounts' })
  async list(@CurrentUser() user: JwtPayload) {
    return this.emailAccountService.listForUser(user.sub);
  }

  @Get('connect/google')
  @UseGuards(JwtAuthGuard, GoogleConnectGuard)
  @ApiOperation({ summary: 'Start connecting a Gmail mailbox' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to Google consent screen',
  })
  connectGoogle(): void {}

  @Get('connect/google/callback')
  @UseGuards(GoogleConnectGuard)
  @ApiOperation({ summary: 'Gmail connect OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirects back to the frontend' })
  async connectGoogleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.handleConnectCallback(req, res);
  }

  @Get('connect/microsoft')
  @UseGuards(JwtAuthGuard, MicrosoftConnectGuard)
  @ApiOperation({ summary: 'Start connecting an Outlook mailbox' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to Microsoft consent screen',
  })
  connectMicrosoft(): void {}

  @Get('connect/microsoft/callback')
  @UseGuards(MicrosoftConnectGuard)
  @ApiOperation({ summary: 'Outlook connect OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirects back to the frontend' })
  async connectMicrosoftCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.handleConnectCallback(req, res);
  }

  @Post('connect/imap')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Connect a mailbox via IMAP/SMTP credentials' })
  @ApiResponse({ status: 201, description: 'The connected account' })
  @ApiResponse({
    status: 400,
    description: 'Could not authenticate with the IMAP server',
  })
  async connectImap(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConnectImapDto,
  ) {
    return this.emailAccountService.connectImap(user.sub, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Update an email account (rename, primary, sync toggle)',
  })
  @ApiResponse({ status: 200, description: 'The updated account' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateEmailAccountDto,
  ) {
    return this.emailAccountService.updateAccount(user.sub, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Disconnect an email account' })
  @ApiResponse({ status: 200, description: 'The account was disconnected' })
  async disconnect(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.emailAccountService.disconnect(user.sub, id);
    return { success: true };
  }

  @Post(':id/sync')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Manually trigger an incremental sync for an account',
  })
  @ApiResponse({ status: 202, description: 'Sync enqueued' })
  async triggerSync(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.emailAccountService.getOwnedAccountOrThrow(user.sub, id);
    await this.queueService.enqueueIncrementalSync(id);
    return { success: true };
  }

  private async handleConnectCallback(
    req: Request,
    res: Response,
  ): Promise<void> {
    const result = req.user as MailConnectResult;

    const account = await this.emailAccountService.connectOAuthAccount(result);

    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const redirectUrl = new URL('/settings/email-accounts', frontendUrl);
    redirectUrl.searchParams.set('connected', account.provider.toLowerCase());

    res.redirect(redirectUrl.toString());
  }
}
