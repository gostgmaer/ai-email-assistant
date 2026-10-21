import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth';
// Leaf-file import, forwardRef for the same Auth cycle as above — Slack
// delivery posts through the user's Slack integration.
import { IntegrationModule } from '../integration/integration.module';
import { NotificationController } from './controllers/notification.controller';
import { NotificationProcessor } from './processors/notification.processor';
import { NotificationDeliveryService } from './services/notification-delivery.service';
import { NotificationService } from './services/notification.service';

@Module({
  // Reachable in a cycle back to AuthModule via WorkflowModule
  // (AuthModule -> CalendarModule -> AiModule -> WorkflowModule ->
  // NotificationModule -> AuthModule, added for WorkflowRuleService's
  // NotificationService dependency).
  imports: [forwardRef(() => AuthModule), forwardRef(() => IntegrationModule)],

  controllers: [NotificationController],

  providers: [
    NotificationService,
    NotificationDeliveryService,
    NotificationProcessor,
  ],

  exports: [NotificationService],
})
export class NotificationModule {}
