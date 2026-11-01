import { forwardRef, Module } from '@nestjs/common';

// Leaf-file imports and forwardRef — same reasoning as AutomationModule's.
import { AgentModule } from '../agent/agent.module';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { EmailAccountModule } from '../email-account/email-account.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ImprovementController } from './controllers/improvement.controller';
import { ImprovementService } from './services/improvement.service';

@Module({
  imports: [
    EmailAccountModule,
    AgentModule,
    forwardRef(() => AuthModule),
    forwardRef(() => AiModule),
    forwardRef(() => WorkflowModule),
  ],
  controllers: [ImprovementController],
  providers: [ImprovementService],
  exports: [ImprovementService],
})
export class ImprovementModule {}
