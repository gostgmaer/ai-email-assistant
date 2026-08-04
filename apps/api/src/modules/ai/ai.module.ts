import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth';
import { AiController } from './controllers/ai.controller';
import { AiClientService } from './services/ai-client.service';

@Module({
  imports: [ConfigModule, AuthModule],

  controllers: [AiController],

  providers: [AiClientService],

  exports: [AiClientService],
})
export class AiModule {}
