import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AgentModule } from '../agent';
import { AuthModule } from '../auth';
import { CalendarModule } from '../calendar';
import { DocumentsModule } from '../documents';
import { EmailModule } from '../email';
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
  ],

  controllers: [AiController],

  providers: [AiClientService, ContactMemoryService, AiProcessingProcessor],

  exports: [AiClientService, ContactMemoryService],
})
export class AiModule {}
