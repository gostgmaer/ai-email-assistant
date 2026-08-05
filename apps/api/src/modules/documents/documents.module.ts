import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AiModule } from '../ai';
import { AuthModule } from '../auth';
import { DocumentsController } from './controllers/documents.controller';
import { DocumentsService } from './services/documents.service';

@Module({
  imports: [ConfigModule, AuthModule, AiModule],

  controllers: [DocumentsController],

  providers: [DocumentsService],
})
export class DocumentsModule {}
