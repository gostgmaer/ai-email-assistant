import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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

import { GoogleAuthGuard, MicrosoftAuthGuard } from '../../oauth';
import { OAuthValidationResult } from '../../oauth/interfaces';
import { CurrentUser } from '../decorators/current-user.decorator';
import { RefreshTokenDto } from '../dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { AuthService } from '../services/auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Start Google OAuth login' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to Google consent screen',
  })
  googleLogin(): void {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to FRONTEND_URL with access/refresh tokens',
  })
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.handleOAuthCallback(req, res);
  }

  @Get('microsoft')
  @UseGuards(MicrosoftAuthGuard)
  @ApiOperation({ summary: 'Start Microsoft OAuth login' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to Microsoft consent screen',
  })
  microsoftLogin(): void {}

  @Get('microsoft/callback')
  @UseGuards(MicrosoftAuthGuard)
  @ApiOperation({ summary: 'Microsoft OAuth callback' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to FRONTEND_URL with access/refresh tokens',
  })
  async microsoftCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.handleOAuthCallback(req, res);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate a refresh token for a new access/refresh pair',
  })
  @ApiResponse({ status: 200, description: 'New access/refresh token pair' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  @ApiResponse({ status: 204, description: 'Refresh token revoked' })
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get the current authenticated user' })
  @ApiResponse({ status: 200, description: 'The current user' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  async me(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }

  private async handleOAuthCallback(
    req: Request,
    res: Response,
  ): Promise<void> {
    const { profile } = req.user as OAuthValidationResult;

    const { tokens } = await this.authService.loginWithOAuth(profile);

    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const redirectUrl = new URL('/auth/callback', frontendUrl);
    redirectUrl.searchParams.set('accessToken', tokens.accessToken);
    redirectUrl.searchParams.set('refreshToken', tokens.refreshToken);

    res.redirect(redirectUrl.toString());
  }
}
