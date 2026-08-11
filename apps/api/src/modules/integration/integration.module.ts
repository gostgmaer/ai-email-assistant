import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Leaf-file import rather than the '../auth' barrel — that barrel
// re-exports auth.module.ts, which sits in a forwardRef() cycle with
// EmailAccountModule/CalendarModule (see documents.controller.ts's
// identical comment for the same issue).
import { AuthModule } from '../auth/auth.module';
import { EmailAccountModule } from '../email-account';
import { IntegrationController } from './controllers/integration.controller';
import { HubspotService } from './services/hubspot.service';
import { IntegrationConnectStateService } from './services/integration-connect-state.service';
import { IntegrationService } from './services/integration.service';
import { SlackService } from './services/slack.service';
import { TeamsService } from './services/teams.service';

// AuthModule doesn't depend back on this module, but forwardRef() is still
// required here: AuthModule's own load (triggered near the top of
// app.module.ts) synchronously requires CalendarModule/EmailAccountModule
// before its class body finishes, and one of those transitively requires
// this module — so a *plain* `AuthModule` reference in this file can be
// evaluated while auth.module.ts is still mid-load, before its exports are
// populated (confirmed via a live "IntegrationModule imports[2] is
// undefined" bootstrap failure). forwardRef defers the property read to
// Nest's DI resolution phase, after every module has finished loading.
@Module({
  imports: [ConfigModule, EmailAccountModule, forwardRef(() => AuthModule)],

  controllers: [IntegrationController],

  providers: [
    IntegrationService,
    SlackService,
    TeamsService,
    HubspotService,
    IntegrationConnectStateService,
  ],

  exports: [IntegrationService],
})
export class IntegrationModule {}
