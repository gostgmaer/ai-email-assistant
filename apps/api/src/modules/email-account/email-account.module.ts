import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { AuthModule } from '../auth';
import { EmailAccountController } from './controllers/email-account.controller';
import { GoogleConnectGuard } from './guards/google-connect.guard';
import { MicrosoftConnectGuard } from './guards/microsoft-connect.guard';
import { ConnectStateService } from './services/connect-state.service';
import { EmailAccountService } from './services/email-account.service';
import { GoogleConnectStrategy } from './strategies/google-connect.strategy';
import { MicrosoftConnectStrategy } from './strategies/microsoft-connect.strategy';

@Module({
  // AuthController (in AuthModule) auto-connects a mailbox from the login
  // OAuth grant, so AuthModule imports this module too — forwardRef() on
  // both sides breaks the resulting cycle.
  imports: [ConfigModule, PassportModule, forwardRef(() => AuthModule)],

  controllers: [EmailAccountController],

  providers: [
    EmailAccountService,
    ConnectStateService,
    GoogleConnectStrategy,
    MicrosoftConnectStrategy,
    GoogleConnectGuard,
    MicrosoftConnectGuard,
  ],

  exports: [EmailAccountService, ConnectStateService],
})
export class EmailAccountModule {}
