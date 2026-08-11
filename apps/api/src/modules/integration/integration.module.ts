import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Leaf-file import rather than the '../auth' barrel — that barrel
// re-exports auth.module.ts, which sits in a forwardRef() cycle with
// EmailAccountModule/CalendarModule. Importing the barrel here hit
// auth/index.ts mid-load at bootstrap and got `undefined` for AuthModule
// (see documents.controller.ts's identical comment for the same issue).
import { AuthModule } from '../auth/auth.module';
import { EmailAccountModule } from '../email-account';
import { IntegrationController } from './controllers/integration.controller';
import { IntegrationConnectStateService } from './services/integration-connect-state.service';
import { IntegrationService } from './services/integration.service';
import { SlackService } from './services/slack.service';

// AuthModule (imported plain, not forwardRef — it doesn't depend back on
// this module) supplies JwtModule for IntegrationConnectStateService and
// JwtAuthGuard for the controller, same as EmailAccountModule does for
// its own connect-state service.
@Module({
  imports: [ConfigModule, EmailAccountModule, AuthModule],

  controllers: [IntegrationController],

  providers: [IntegrationService, SlackService, IntegrationConnectStateService],

  exports: [IntegrationService],
})
export class IntegrationModule {}
