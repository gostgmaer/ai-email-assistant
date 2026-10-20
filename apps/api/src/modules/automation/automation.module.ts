import { Module, OnApplicationBootstrap, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { QueueService } from '../../infrastructure/queue';
// Leaf-file imports and forwardRef(AuthModule) — same reasoning as
// ApprovalModule's comment.
import { AuthModule } from '../auth/auth.module';
import { EmailAccountModule } from '../email-account';
import { EmailModule } from '../email/email.module';
import { NotificationModule } from '../notification';
import { AutomationController } from './controllers/automation.controller';
import { AutomationProcessor } from './processors/automation.processor';
import { AutomationService } from './services/automation.service';

@Module({
  imports: [
    ConfigModule,
    EmailAccountModule,
    EmailModule,
    NotificationModule,
    forwardRef(() => AuthModule),
  ],

  controllers: [AutomationController],

  providers: [AutomationService, AutomationProcessor],

  exports: [AutomationService],
})
export class AutomationModule implements OnApplicationBootstrap {
  constructor(private readonly queueService: QueueService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queueService.scheduleRuleExecutionCleanup();
  }
}
