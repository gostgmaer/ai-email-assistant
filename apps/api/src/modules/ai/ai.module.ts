import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AgentModule } from '../agent';
import { ApprovalModule } from '../approval';
import { AuthModule } from '../auth';
import { CalendarModule } from '../calendar';
import { CrmModule } from '../crm';
import { DocumentsModule } from '../documents';
import { EmailModule } from '../email';
import { NotificationModule } from '../notification';
import { TasksModule } from '../tasks';
import { WorkflowModule } from '../workflow';
import { AiController } from './controllers/ai.controller';
import { AiProcessingProcessor } from './processors/ai-processing.processor';
import { AiClientService } from './services/ai-client.service';
import { ContactMemoryService } from './services/contact-memory.service';

@Module({
  imports: [
    ConfigModule,
    // Reachable in a cycle back to AuthModule via CalendarModule
    // (AuthModule -> CalendarModule -> AiModule -> AuthModule, added for
    // MeetingSchedulingController's AiClientService dependency).
    forwardRef(() => AuthModule),
    EmailModule,
    TasksModule,
    forwardRef(() => DocumentsModule),
    // AiProcessingProcessor's opt-in auto-schedule hook needs
    // MeetingSchedulingService — CalendarModule already imports AiModule
    // (for AiClientService), so this side of the cycle needs forwardRef()
    // too.
    forwardRef(() => CalendarModule),
    // WorkflowModule -> EmailAccountModule -> AuthModule -> CalendarModule
    // -> AiModule is already reachable (see above) — this new edge closes
    // that back into a real cycle through AiModule itself.
    forwardRef(() => WorkflowModule),
    // Same reasoning as WorkflowModule above — AgentModule -> EmailAccountModule
    // -> AuthModule -> CalendarModule -> AiModule closes another cycle.
    forwardRef(() => AgentModule),
    // Same reasoning again — CrmModule -> EmailAccountModule -> AuthModule
    // -> CalendarModule -> AiModule closes the same cycle a third time.
    forwardRef(() => CrmModule),
    // NotificationModule -> AuthModule -> CalendarModule -> AiModule closes
    // the same cycle again, for AiProcessingProcessor's auto-send
    // notification (§7 — see docs/enterprise-ai-pipeline-plan.md).
    forwardRef(() => NotificationModule),
    // Same reasoning again — ApprovalModule -> EmailAccountModule ->
    // AuthModule -> CalendarModule -> AiModule closes the same cycle a
    // fourth time, for AiProcessingProcessor's REQUIRE_APPROVAL_CHAIN
    // handling (v3.0, see docs/MVP.md).
    forwardRef(() => ApprovalModule),
  ],

  controllers: [AiController],

  providers: [AiClientService, ContactMemoryService, AiProcessingProcessor],

  exports: [AiClientService, ContactMemoryService],
})
export class AiModule {}
