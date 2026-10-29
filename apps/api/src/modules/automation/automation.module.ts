import { Module, OnApplicationBootstrap, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { QueueService } from '../../infrastructure/queue';
// Leaf-file imports and forwardRef(AuthModule) — same reasoning as
// ApprovalModule's comment.
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { EmailAccountModule } from '../email-account';
import { EmailModule } from '../email/email.module';
import { NotificationModule } from '../notification';
import { AnalyticsController } from './controllers/analytics.controller';
import { AutomationController } from './controllers/automation.controller';
import { AutomationProcessor } from './processors/automation.processor';
import { AutomationMetricsService } from './services/automation-metrics.service';
import { AutomationService } from './services/automation.service';

@Module({
  imports: [
    ConfigModule,
    EmailAccountModule,
    EmailModule,
    NotificationModule,
    forwardRef(() => AuthModule),
    // CommitmentService, for the commitment scan; AiModule sits in the
    // AuthModule -> CalendarModule -> AiModule cycle.
    forwardRef(() => AiModule),
  ],

  controllers: [AutomationController, AnalyticsController],

  providers: [AutomationService, AutomationMetricsService, AutomationProcessor],

  exports: [AutomationService],
})
export class AutomationModule implements OnApplicationBootstrap {
  constructor(private readonly queueService: QueueService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queueService.scheduleRuleExecutionCleanup();
    await this.queueService.scheduleFollowUpScan();
    await this.queueService.scheduleTriageScan();
    await this.queueService.scheduleCommitmentScan();
    await this.queueService.scheduleWritingStyleRefresh();
  }
}
