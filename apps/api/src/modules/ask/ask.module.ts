import { forwardRef, Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { QueueService } from '../../infrastructure/queue';
import { AiModule } from '../ai';
import { AuthModule } from '../auth';
import { AskController } from './controllers/ask.controller';
import { SearchIndexProcessor } from './processors/search-index.processor';
import { AskService } from './services/ask.service';
import { EmailIndexService } from './services/email-index.service';
import { EmailSearchService } from './services/email-search.service';

/** "Ask your inbox" (docs/ai-features-implementation-plan.md, Phase 1):
 * indexes mail into EmailChunk and answers questions from it. */
@Module({
  // forwardRef() like the other feature modules: AuthModule and AiModule
  // sit in an import cycle (via CalendarModule).
  imports: [
    ConfigModule,
    forwardRef(() => AuthModule),
    forwardRef(() => AiModule),
  ],

  controllers: [AskController],

  providers: [
    AskService,
    EmailIndexService,
    EmailSearchService,
    SearchIndexProcessor,
  ],

  exports: [EmailIndexService],
})
export class AskModule implements OnApplicationBootstrap {
  constructor(private readonly queueService: QueueService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queueService.scheduleSearchIndexScan();
  }
}
