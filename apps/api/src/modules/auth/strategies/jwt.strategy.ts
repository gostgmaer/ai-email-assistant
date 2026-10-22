import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { JwtPayload } from '../interfaces/jwt-payload.interface';

const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken();

// The only routes a token may arrive on in the URL: OAuth "connect"
// redirects (/email-accounts/connect/google, /integrations/connect/slack…).
const CONNECT_PATH = /\/connect\/[a-z]+$/;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
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

  validate(req: Request, payload: JwtPayload): JwtPayload {
    const isTicket = payload.purpose === 'connect';
    const viaHeader = fromHeader(req) !== null;

    // A ticket is accepted only from the URL of a connect route; the URL
    // accepts nothing but a ticket; and a ticket never works as a bearer
    // access token.
    if (viaHeader ? isTicket : !isTicket || !CONNECT_PATH.test(req.path)) {
      throw new UnauthorizedException();
    }

    return { sub: payload.sub, email: payload.email };
  }
}
