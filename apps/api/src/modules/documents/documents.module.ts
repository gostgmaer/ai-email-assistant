import { forwardRef, Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { QueueService } from '../../infrastructure/queue';
import { AiModule } from '../ai';
import { AuthModule } from '../auth';
import { DocumentsController } from './controllers/documents.controller';
import { DocumentsProcessingProcessor } from './processors/documents-processing.processor';
import { DocumentsService } from './services/documents.service';
import { FileStorageService } from './services/file-storage.service';

@Module({
  imports: [ConfigModule, AuthModule, forwardRef(() => AiModule)],

  controllers: [DocumentsController],

  providers: [
    DocumentsService,
    FileStorageService,
    DocumentsProcessingProcessor,
  ],

  // AiProcessingProcessor uses DocumentsService to ground replies in the
  // user's uploaded documents, so this module and AiModule import each
  // other — hence forwardRef() on both sides.
  exports: [DocumentsService],
})
export class DocumentsModule implements OnApplicationBootstrap {
  constructor(private readonly queueService: QueueService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queueService.scheduleDocumentCleanup();
  }
}
