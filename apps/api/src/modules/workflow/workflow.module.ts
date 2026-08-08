import { Module } from '@nestjs/common';

import { EmailAccountModule } from '../email-account';
import { NotificationModule } from '../notification';
import { WorkflowRuleController } from './controllers/workflow-rule.controller';
import { WorkflowRuleService } from './services/workflow-rule.service';

// No forwardRef() anywhere here: WorkflowModule is a leaf consumer of
// EmailAccountModule/NotificationModule, and nothing in this module is
// imported back by either of them — AiModule imports WorkflowModule
// (plain) for AiProcessingProcessor's rule evaluation, and WorkflowModule
// doesn't import AiModule back, so no new cycle.
@Module({
  imports: [EmailAccountModule, NotificationModule],
  controllers: [WorkflowRuleController],
  providers: [WorkflowRuleService],
  exports: [WorkflowRuleService],
})
export class WorkflowModule {}
