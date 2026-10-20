import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import type { CalendarAccountService } from '../../calendar';
import type { EmailAccountService } from '../../email-account';
import type { OAuthValidationResult } from '../../oauth/interfaces';
import type { RefreshTokenDto } from '../dto';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';
import type { AuthService } from '../services/auth.service';
import type { TokenService } from '../services/token.service';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const tokens = {
    accessToken: 'access.jwt',
    refreshToken: 'raw-refresh-token',
  };
  const user = {
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'Ada Lovelace',
    avatar: null as string | null,
    passwordHash: 'super-secret-hash',
    emailVerifiedAt: null as Date | null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const expectedPublicUser = {
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'Ada Lovelace',
    avatar: null,
    emailVerifiedAt: null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  function buildDeps(nodeEnv = 'development') {
    const authService = {
      register: jest.fn(),
      loginWithPassword: jest.fn(),
      loginWithOAuth: jest.fn(),
      verifyEmail: jest.fn(),
      resendVerificationEmail: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    } as unknown as AuthService;

    const tokenService = {
      listActiveSessions: jest.fn(),
      revokeSessionById: jest.fn(),
      revokeAllSessions: jest.fn(),
    } as unknown as TokenService;

    const configService = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string> = {
          FRONTEND_URL: 'https://app.example.com',
          JWT_REFRESH_EXPIRES_IN: '30d',
        };
        return values[key];
      }),
      get: jest.fn((key: string) =>
        key === 'NODE_ENV' ? nodeEnv : undefined,
      ),
    } as unknown as ConfigService;

    const emailAccountService = {
      connectOAuthAccount: jest.fn().mockResolvedValue(undefined),
    } as unknown as EmailAccountService;

    const calendarAccountService = {
      connectOAuthAccount: jest.fn().mockResolvedValue(undefined),
    } as unknown as CalendarAccountService;

    const controller = new AuthController(
      authService,
      tokenService,
      configService,
      emailAccountService,
      calendarAccountService,
    );

    return {
      controller,
      authService,
      tokenService,
      configService,
      emailAccountService,
      calendarAccountService,
    };
  }

  function buildReq(overrides?: Record<string, unknown>): Request {
    return {
      headers: { 'user-agent': 'jest-agent' },
      ip: '127.0.0.1',
      cookies: {},
      query: {},
      ...overrides,
    } as unknown as Request;
  }

  function buildRes(): Response {
    return {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      redirect: jest.fn(),
    } as unknown as Response;
  }

  describe('register', () => {
    it('sets an httpOnly refresh cookie and never returns the refresh token or password hash in the body', async () => {
      const { controller, authService } = buildDeps();
      (authService.register as jest.Mock).mockResolvedValue({ user, tokens });
      const req = buildReq();
      const res = buildRes();

      const result = await controller.register(
        { email: 'user@example.com', password: 'password123' },
        req,
        res,
      );

      expect(authService.register).toHaveBeenCalledWith(
        { email: 'user@example.com', password: 'password123' },
        { userAgent: 'jest-agent', ipAddress: '127.0.0.1' },
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'raw-refresh-token',
        expect.objectContaining({ httpOnly: true, path: '/auth' }),
      );
      expect(result).toEqual({
        user: expectedPublicUser,
        accessToken: 'access.jwt',
      });
      expect(result).not.toHaveProperty('refreshToken');
      expect(result.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('login', () => {
    it('sets a secure, SameSite=Lax cookie in production and an insecure one in development', async () => {
      const dev = buildDeps('development');
      (dev.authService.loginWithPassword as jest.Mock).mockResolvedValue({
        user,
        tokens,
      });
      const devRes = buildRes();
      await dev.controller.login(
        { email: 'user@example.com', password: 'password123' },
        buildReq(),
        devRes,
      );
      expect(devRes.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'raw-refresh-token',
        expect.objectContaining({ secure: false, sameSite: 'lax' }),
      );

      const prod = buildDeps('production');
      (prod.authService.loginWithPassword as jest.Mock).mockResolvedValue({
        user,
        tokens,
      });
      const prodRes = buildRes();
      await prod.controller.login(
        { email: 'user@example.com', password: 'password123' },
        buildReq(),
        prodRes,
      );
      expect(prodRes.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'raw-refresh-token',
        expect.objectContaining({ secure: true }),
      );
    });

    it('never leaks the password hash through the response body', async () => {
      const { controller, authService } = buildDeps();
      (authService.loginWithPassword as jest.Mock).mockResolvedValue({
        user,
        tokens,
      });

      const result = await controller.login(
        { email: 'user@example.com', password: 'password123' },
        buildReq(),
        buildRes(),
      );

      expect(result.user).toEqual(expectedPublicUser);
    });
  });

  describe('refresh', () => {
    it('prefers the httpOnly cookie over a body-supplied refresh token', async () => {
      const { controller, authService } = buildDeps();
      (authService.refresh as jest.Mock).mockResolvedValue(tokens);
      const req = buildReq({ cookies: { refreshToken: 'cookie-token' } });
      const dto: RefreshTokenDto = { refreshToken: 'body-token' };

      await controller.refresh(dto, req, buildRes());

      expect(authService.refresh).toHaveBeenCalledWith(
        'cookie-token',
        expect.any(Object),
      );
    });

    it('falls back to the request body for non-browser clients with no cookie', async () => {
      const { controller, authService } = buildDeps();
      (authService.refresh as jest.Mock).mockResolvedValue(tokens);
      const req = buildReq({ cookies: {} });
      const dto: RefreshTokenDto = { refreshToken: 'body-token' };

      await controller.refresh(dto, req, buildRes());

      expect(authService.refresh).toHaveBeenCalledWith(
        'body-token',
        expect.any(Object),
      );
    });

    it('rejects when neither a cookie nor a body token is present', async () => {
      const { controller, authService } = buildDeps();
      const req = buildReq({ cookies: {} });

      await expect(controller.refresh({}, req, buildRes())).rejects.toThrow(
        UnauthorizedException,
      );
      expect(authService.refresh).not.toHaveBeenCalled();
    });

    it('returns only the new access token and rotates the refresh cookie', async () => {
      const { controller, authService } = buildDeps();
      (authService.refresh as jest.Mock).mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
      const req = buildReq({ cookies: { refreshToken: 'old-token' } });
      const res = buildRes();

      const result = await controller.refresh({}, req, res);

      expect(result).toEqual({ accessToken: 'new-access-token' });
      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'new-refresh-token',
        expect.any(Object),
      );
    });
  });

  describe('logout', () => {
    it('revokes the cookie-supplied refresh token and clears the cookie', async () => {
      const { controller, authService } = buildDeps();
      const req = buildReq({ cookies: { refreshToken: 'cookie-token' } });
      const res = buildRes();

      await controller.logout({}, req, res);

      expect(authService.logout).toHaveBeenCalledWith('cookie-token');
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', {
        path: '/auth',
      });
    });

    it('rejects when there is no refresh token to revoke', async () => {
      const { controller, authService } = buildDeps();
      const req = buildReq({ cookies: {} });

      await expect(controller.logout({}, req, buildRes())).rejects.toThrow(
        UnauthorizedException,
      );
      expect(authService.logout).not.toHaveBeenCalled();
    });
  });

  describe('sessions', () => {
    it('lists sessions using the cookie to infer which one is current', async () => {
      const { controller, tokenService } = buildDeps();
      const req = buildReq({ cookies: { refreshToken: 'current-token' } });
      const jwtUser: JwtPayload = { sub: 'user-1', email: 'user@example.com' };

      await controller.listSessions(jwtUser, req);

      expect(tokenService.listActiveSessions).toHaveBeenCalledWith(
        'user-1',
        'current-token',
      );
    });

    it('falls back to a query-param hint when there is no cookie', async () => {
      const { controller, tokenService } = buildDeps();
      const req = buildReq({
        cookies: {},
        query: { refreshToken: 'query-token' },
      });
      const jwtUser: JwtPayload = { sub: 'user-1', email: 'user@example.com' };

      await controller.listSessions(jwtUser, req);

      expect(tokenService.listActiveSessions).toHaveBeenCalledWith(
        'user-1',
        'query-token',
      );
    });

    it('scopes session revocation to the authenticated user, never a client-supplied user id', async () => {
      const { controller, tokenService } = buildDeps();
      const jwtUser: JwtPayload = { sub: 'user-1', email: 'user@example.com' };

      await controller.revokeSession(jwtUser, 'session-42');

      expect(tokenService.revokeSessionById).toHaveBeenCalledWith(
        'user-1',
        'session-42',
      );
    });

    it('revokes all sessions for the authenticated user only', async () => {
      const { controller, tokenService } = buildDeps();
      const jwtUser: JwtPayload = { sub: 'user-1', email: 'user@example.com' };

      await controller.revokeAllSessions(jwtUser);

      expect(tokenService.revokeAllSessions).toHaveBeenCalledWith('user-1');
    });
  });

  describe('OAuth callback', () => {
    function buildOAuthReq(overrides?: Partial<OAuthValidationResult>) {
      const validation: OAuthValidationResult = {
        profile: {
          provider: 'GOOGLE',
          providerId: 'google-1',
          email: 'user@example.com',
          displayName: 'Ada Lovelace',
          avatar: 'https://example.com/ada.png',
        },
        tokens: {
          accessToken: 'provider-access-token',
          refreshToken: 'provider-refresh-token',
          expiresAt: new Date('2026-06-01T00:00:00.000Z'),
        },
        ...overrides,
      };

      return buildReq({ user: validation });
    }

    it('logs the user in, auto-connects mail and calendar, and redirects with only the access token', async () => {
      const {
        controller,
        authService,
        emailAccountService,
        calendarAccountService,
      } = buildDeps();
      (authService.loginWithOAuth as jest.Mock).mockResolvedValue({
        user,
        tokens,
      });
      const req = buildOAuthReq();
      const res = buildRes();

      await controller.googleCallback(req, res);

      expect(emailAccountService.connectOAuthAccount).toHaveBeenCalledWith({
        userId: 'user-1',
        profile: {
          provider: 'GOOGLE',
          email: 'user@example.com',
          displayName: 'Ada Lovelace',
        },
        tokens: {
          accessToken: 'provider-access-token',
          refreshToken: 'provider-refresh-token',
          expiresAt: new Date('2026-06-01T00:00:00.000Z'),
        },
      });
      expect(calendarAccountService.connectOAuthAccount).toHaveBeenCalled();
      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'raw-refresh-token',
        expect.any(Object),
      );

      const redirectUrl = (res.redirect as jest.Mock).mock.calls[0][0] as string;
      expect(redirectUrl).toContain('https://app.example.com/auth/callback');
      expect(redirectUrl).toContain('accessToken=access.jwt');
      expect(redirectUrl).not.toContain('raw-refresh-token');
      expect(redirectUrl.toLowerCase()).not.toContain('refreshtoken=');
    });

    it('still logs the user in and connects the calendar when connecting the mailbox fails', async () => {
      const {
        controller,
        authService,
        emailAccountService,
        calendarAccountService,
      } = buildDeps();
      (authService.loginWithOAuth as jest.Mock).mockResolvedValue({
        user,
        tokens,
      });
      (
        emailAccountService.connectOAuthAccount as jest.Mock
      ).mockRejectedValue(new Error('mailbox connect failed'));
      const req = buildOAuthReq();
      const res = buildRes();

      await expect(controller.googleCallback(req, res)).resolves.toBeUndefined();

      expect(calendarAccountService.connectOAuthAccount).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalled();
    });

    it('still redirects when connecting the calendar fails', async () => {
      const { controller, authService, calendarAccountService } =
        buildDeps();
      (authService.loginWithOAuth as jest.Mock).mockResolvedValue({
        user,
        tokens,
      });
      (
        calendarAccountService.connectOAuthAccount as jest.Mock
      ).mockRejectedValue(new Error('calendar connect failed'));
      const req = buildOAuthReq();
      const res = buildRes();

      await expect(controller.googleCallback(req, res)).resolves.toBeUndefined();

      expect(res.redirect).toHaveBeenCalled();
    });

    it('routes the Microsoft callback through the same handler', async () => {
      const { controller, authService } = buildDeps();
      (authService.loginWithOAuth as jest.Mock).mockResolvedValue({
        user,
        tokens,
      });
      const req = buildOAuthReq({
        profile: {
          provider: 'MICROSOFT',
          providerId: 'ms-1',
          email: 'user@example.com',
          displayName: 'Ada Lovelace',
        },
      });
      const res = buildRes();

      await controller.microsoftCallback(req, res);

      expect(authService.loginWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'MICROSOFT' }),
        expect.any(Object),
      );
      expect(res.redirect).toHaveBeenCalled();
    });
  });
});
