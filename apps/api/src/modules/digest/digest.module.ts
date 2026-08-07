import { Module, OnApplicationBootstrap } from '@nestjs/common';

import { QueueService } from '../../infrastructure/queue';
import { NotificationModule } from '../notification';
import { DigestProcessor } from './processors/digest.processor';

@Module({
  imports: [NotificationModule],
  providers: [DigestProcessor],
})
export class DigestModule implements OnApplicationBootstrap {
  constructor(private readonly queueService: QueueService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queueService.scheduleDailyDigest();
  }
}
