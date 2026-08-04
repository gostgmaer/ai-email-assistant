import { Module } from '@nestjs/common';

import { AuthModule } from '../auth';
import { NotificationController } from './controllers/notification.controller';
import { NotificationProcessor } from './processors/notification.processor';
import { NotificationService } from './services/notification.service';

@Module({
  imports: [AuthModule],

  controllers: [NotificationController],

  providers: [NotificationService, NotificationProcessor],

  exports: [NotificationService],
})
export class NotificationModule {}
