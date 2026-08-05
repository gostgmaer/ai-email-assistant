import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth';
import { DocumentsModule } from '../documents';
import { EmailModule } from '../email';
import { AiController } from './controllers/ai.controller';
import { AiProcessingProcessor } from './processors/ai-processing.processor';
import { AiClientService } from './services/ai-client.service';
import { ContactMemoryService } from './services/contact-memory.service';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    EmailModule,
    forwardRef(() => DocumentsModule),
  ],

  controllers: [AiController],

  providers: [AiClientService, ContactMemoryService, AiProcessingProcessor],

  exports: [AiClientService, ContactMemoryService],
})
export class AiModule {}
