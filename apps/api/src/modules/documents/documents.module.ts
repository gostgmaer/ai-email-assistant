import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AiModule } from '../ai';
import { AuthModule } from '../auth';
import { DocumentsController } from './controllers/documents.controller';
import { DocumentsService } from './services/documents.service';

@Module({
  imports: [ConfigModule, AuthModule, forwardRef(() => AiModule)],

  controllers: [DocumentsController],

  providers: [DocumentsService],

  // AiProcessingProcessor uses DocumentsService to ground replies in the
  // user's uploaded documents, so this module and AiModule import each
  // other — hence forwardRef() on both sides.
  exports: [DocumentsService],
})
export class DocumentsModule {}
