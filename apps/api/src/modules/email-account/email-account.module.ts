import { Module } from '@nestjs/common';
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
  imports: [ConfigModule, PassportModule, AuthModule],

  controllers: [EmailAccountController],

  providers: [
    EmailAccountService,
    ConnectStateService,
    GoogleConnectStrategy,
    MicrosoftConnectStrategy,
    GoogleConnectGuard,
    MicrosoftConnectGuard,
  ],

  exports: [EmailAccountService],
})
export class EmailAccountModule {}
