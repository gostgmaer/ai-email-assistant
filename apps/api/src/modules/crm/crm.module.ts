import { Module } from '@nestjs/common';

import { EmailAccountModule } from '../email-account';
import { ContactController } from './controllers/contact.controller';
import { ContactService } from './services/contact.service';

// Leaf consumer of EmailAccountModule only — same shape as AgentModule,
// no forwardRef() needed on this side (AiModule needs one on ITS side to
// close the cycle, same reasoning as AgentModule — see ai.module.ts).
@Module({
  imports: [EmailAccountModule],
  controllers: [ContactController],
  providers: [ContactService],
  exports: [ContactService],
})
export class CrmModule {}
