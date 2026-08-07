import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';

import { toPublicUser } from '../../../common/utils/public-user';
import { CalendarAccountService } from '../../calendar';
import { EmailAccountService } from '../../email-account';
import { GoogleAuthGuard, MicrosoftAuthGuard } from '../../oauth';
import { OAuthValidationResult } from '../../oauth/interfaces';
import { CurrentUser } from '../decorators/current-user.decorator';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from '../dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { AuthService } from '../services/auth.service';
import { DeviceMetadata, TokenService } from '../services/token.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => EmailAccountService))
    private readonly emailAccountService: EmailAccountService,
    @Inject(forwardRef(() => CalendarAccountService))
    private readonly calendarAccountService: CalendarAccountService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register with email and password' })
  @ApiResponse({ status: 201, description: 'The created user and token pair' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const { user, tokens } = await this.authService.register(
      dto,
      this.extractDevice(req),
    );

    return { user: toPublicUser(user), ...tokens };
  }

  @Post('login')
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({ status: 200, description: 'The user and token pair' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const { user, tokens } = await this.authService.loginWithPassword(
      dto.email,
      dto.password,
      this.extractDevice(req),
    );

    return { user: toPublicUser(user), ...tokens };
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify an email address with a token' })
  @ApiResponse({ status: 204, description: 'Email verified' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Resend the email verification link' })
  @ApiResponse({
    status: 204,
    description: 'Verification email sent (if unverified)',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendVerification(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.authService.resendVerificationEmail(user.sub);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({
    status: 204,
    description: 'Reset email sent if the account exists',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset a password using a reset token' })
  @ApiResponse({ status: 204, description: 'Password reset' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List active sessions (refresh tokens) for the current user',
  })
  @ApiResponse({ status: 200, description: 'The active sessions' })
  async listSessions(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    const currentToken = this.extractBearerRefreshHint(req);
    return this.tokenService.listActiveSessions(user.sub, currentToken);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a single session' })
  @ApiResponse({ status: 204, description: 'Session revoked' })
  async revokeSession(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<void> {
    await this.tokenService.revokeSessionById(user.sub, id);
  }

  @Post('sessions/revoke-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke every session for the current user' })
  @ApiResponse({ status: 204, description: 'All sessions revoked' })
  async revokeAllSessions(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.tokenService.revokeAllSessions(user.sub);
  }

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
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.authService.refresh(dto.refreshToken, this.extractDevice(req));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  @ApiResponse({ status: 204, description: 'Refresh token revoked' })
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  private async handleOAuthCallback(
    req: Request,
    res: Response,
  ): Promise<void> {
    const { profile, tokens: providerTokens } =
      req.user as OAuthValidationResult;

    const { user, tokens } = await this.authService.loginWithOAuth(
      profile,
      this.extractDevice(req),
    );

    // Best-effort: LOGIN_SCOPES (see google.strategy.ts/microsoft.strategy.ts)
    // now request Gmail/Calendar access alongside identity in the same
    // consent screen, so a successful OAuth login can connect the mailbox
    // and calendar automatically — no separate manual "connect" step.
    // Password-registered users never reach this method at all, so they
    // still connect manually via the email-accounts/calendar-accounts
    // settings pages. Must never fail the login itself.
    await this.autoConnectMailAndCalendar(user.id, profile, providerTokens);

    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const redirectUrl = new URL('/auth/callback', frontendUrl);
    redirectUrl.searchParams.set('accessToken', tokens.accessToken);
    redirectUrl.searchParams.set('refreshToken', tokens.refreshToken);

    res.redirect(redirectUrl.toString());
  }

  private async autoConnectMailAndCalendar(
    userId: string,
    profile: OAuthValidationResult['profile'],
    tokens: OAuthValidationResult['tokens'],
  ): Promise<void> {
    const connectProfile = {
      provider: profile.provider,
      email: profile.email,
      displayName: profile.displayName,
    };
    const connectTokens = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    };

    try {
      await this.emailAccountService.connectOAuthAccount({
        userId,
        profile: connectProfile,
        tokens: connectTokens,
      });
    } catch (error) {
      this.logger.warn(
        `Auto-connect mailbox failed for user ${userId} (${profile.provider}): ${String(error)}`,
      );
    }

    try {
      await this.calendarAccountService.connectOAuthAccount({
        userId,
        profile: connectProfile,
        tokens: connectTokens,
      });
    } catch (error) {
      this.logger.warn(
        `Auto-connect calendar failed for user ${userId} (${profile.provider}): ${String(error)}`,
      );
    }
  }

  private extractDevice(req: Request): DeviceMetadata {
    return {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    };
  }

  /** Sessions are listed via the access token; the client optionally passes
   * its own refresh token as a query param so we can flag it as "current". */
  private extractBearerRefreshHint(req: Request): string | undefined {
    const value = req.query.refreshToken;
    return typeof value === 'string' ? value : undefined;
  }
}
