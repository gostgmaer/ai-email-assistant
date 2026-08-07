import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { PrismaModule } from '../../database';
import type { StringValue } from 'ms';
import { CalendarModule } from '../calendar';
import { EmailAccountModule } from '../email-account';
import { OAuthModule } from '../oauth';
import { AuthController } from './controllers/auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { PasswordService } from './services/password.service';
import { VerificationTokenService } from './services/verification-token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    OAuthModule,
    // AuthController auto-connects a mailbox/calendar from the login OAuth
    // grant (see auth.controller.ts's autoConnectMailAndCalendar) — both
    // of these already import AuthModule (for JwtAuthGuard), hence
    // forwardRef() on this side too.
    forwardRef(() => EmailAccountModule),
    forwardRef(() => CalendarModule),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.getOrThrow<StringValue>('JWT_EXPIRES_IN'),
        },
      }),
    }),
  ],

  controllers: [AuthController],

  providers: [
    AuthService,
    TokenService,
    PasswordService,
    VerificationTokenService,
    JwtStrategy,
    JwtAuthGuard,
  ],

  exports: [
    AuthService,
    TokenService,
    PasswordService,
    VerificationTokenService,
    JwtAuthGuard,
    JwtModule,
  ],
})
export class AuthModule {}
