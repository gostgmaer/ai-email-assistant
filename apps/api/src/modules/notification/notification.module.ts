import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth';
import { NotificationController } from './controllers/notification.controller';
import { NotificationProcessor } from './processors/notification.processor';
import { NotificationService } from './services/notification.service';

@Module({
  // Reachable in a cycle back to AuthModule via WorkflowModule
  // (AuthModule -> CalendarModule -> AiModule -> WorkflowModule ->
  // NotificationModule -> AuthModule, added for WorkflowRuleService's
  // NotificationService dependency).
  imports: [forwardRef(() => AuthModule)],

  controllers: [NotificationController],

  providers: [NotificationService, NotificationProcessor],

  exports: [NotificationService],
})
export class NotificationModule {}
