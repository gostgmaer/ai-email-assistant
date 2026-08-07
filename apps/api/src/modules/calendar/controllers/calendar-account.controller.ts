import {
  Controller,
  Delete,
  Get,
  Param,
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

import { CurrentUser, JwtAuthGuard, JwtPayload } from '../../auth';
import { GoogleCalendarConnectGuard } from '../guards/google-calendar-connect.guard';
import { MicrosoftCalendarConnectGuard } from '../guards/microsoft-calendar-connect.guard';
import { CalendarConnectResult } from '../interfaces';
import { CalendarAccountService } from '../services/calendar-account.service';

@ApiTags('calendar-accounts')
@ApiBearerAuth('access-token')
@Controller('calendar-accounts')
export class CalendarAccountController {
  constructor(
    private readonly calendarAccountService: CalendarAccountService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List connected calendar accounts' })
  @ApiResponse({ status: 200, description: 'The connected accounts' })
  async list(@CurrentUser() user: JwtPayload) {
    return this.calendarAccountService.listForUser(user.sub);
  }

  @Get('connect/google')
  @UseGuards(JwtAuthGuard, GoogleCalendarConnectGuard)
  @ApiOperation({ summary: 'Start connecting a Google Calendar' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to Google consent screen',
  })
  connectGoogle(): void {}

  @Get('connect/google/callback')
  @UseGuards(GoogleCalendarConnectGuard)
  @ApiOperation({ summary: 'Google Calendar connect OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirects back to the frontend' })
  async connectGoogleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.handleConnectCallback(req, res);
  }

  @Get('connect/microsoft')
  @UseGuards(JwtAuthGuard, MicrosoftCalendarConnectGuard)
  @ApiOperation({ summary: 'Start connecting an Outlook Calendar' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to Microsoft consent screen',
  })
  connectMicrosoft(): void {}

  @Get('connect/microsoft/callback')
  @UseGuards(MicrosoftCalendarConnectGuard)
  @ApiOperation({ summary: 'Outlook Calendar connect OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirects back to the frontend' })
  async connectMicrosoftCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.handleConnectCallback(req, res);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Disconnect a calendar account' })
  @ApiResponse({ status: 200, description: 'The account was disconnected' })
  async disconnect(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.calendarAccountService.disconnect(user.sub, id);
    return { success: true };
  }

  private async handleConnectCallback(
    req: Request,
    res: Response,
  ): Promise<void> {
    const result = req.user as CalendarConnectResult;

    const account =
      await this.calendarAccountService.connectOAuthAccount(result);

    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const redirectUrl = new URL('/settings/calendar-accounts', frontendUrl);
    redirectUrl.searchParams.set('connected', account.provider.toLowerCase());

    res.redirect(redirectUrl.toString());
  }
}
