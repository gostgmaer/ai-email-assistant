import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../../database';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken();

// The only routes a token may arrive on in the URL: OAuth "connect"
// redirects (/email-accounts/connect/google, /integrations/connect/slack…).
const CONNECT_PATH = /\/connect\/[a-z]+$/;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // A full-page Connect redirect can't set an Authorization header, so
      // those routes also take ?ticket= — a 60-second connect ticket
      // (TokenService.issueConnectTicket), never the access token itself.
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromHeader,
        ExtractJwt.fromUrlQueryParameter('ticket'),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<JwtPayload> {
    const isTicket = payload.purpose === 'connect';
    const viaHeader = fromHeader(req) !== null;

    // A ticket is accepted only from the URL of a connect route; the URL
    // accepts nothing but a ticket; and a ticket never works as a bearer
    // access token.
    if (viaHeader ? isTicket : !isTicket || !CONNECT_PATH.test(req.path)) {
      throw new UnauthorizedException();
    }

    // The token's signature only proves it was issued, not that it still
    // should work: its session must still be live and its user not deleted.
    // Tokens from before sessions were stamped in (no sid) are refused too;
    // the web client refreshes once on a 401 and carries on.
    if (!payload.sid) {
      throw new UnauthorizedException();
    }
    const session = await this.prisma.refreshToken.findUnique({
      where: { id: payload.sid },
      select: {
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: { select: { deletedAt: true } },
      },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.user.deletedAt
    ) {
      throw new UnauthorizedException();
    }

    return { sub: payload.sub, email: payload.email, sid: payload.sid };
  }
}
