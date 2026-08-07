import { Module } from '@nestjs/common';

import { EmailAccountModule } from '../email-account';
import { AgentController } from './controllers/agent.controller';
import { AgentService } from './services/agent.service';

// Leaf consumer of EmailAccountModule only — nothing else imports
// AgentModule back, so no forwardRef() needed anywhere here (unlike
// WorkflowModule, which also needed NotificationModule and ended up in a
// real cycle through AiModule).
@Module({
  imports: [EmailAccountModule],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
