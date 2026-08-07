import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth';
import { DocumentsModule } from '../documents';
import { EmailModule } from '../email';
import { TasksModule } from '../tasks';
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
  ],

  controllers: [AiController],

  providers: [AiClientService, ContactMemoryService, AiProcessingProcessor],

  exports: [AiClientService, ContactMemoryService],
})
export class AiModule {}
