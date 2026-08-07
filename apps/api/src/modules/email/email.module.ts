import { Module, OnApplicationBootstrap, forwardRef } from '@nestjs/common';

import { QueueService } from '../../infrastructure/queue';
import { AuthModule } from '../auth';
import { EmailAccountModule } from '../email-account';
import { EmailController } from './controllers/email.controller';
import { EmailSyncProcessor } from './processors/email-sync.processor';
import { MailProviderFactory } from './providers/mail-provider.factory';
import { ComposeService } from './services/compose.service';
import { EmailSyncService } from './services/email-sync.service';
import { InboxService } from './services/inbox.service';

@Module({
  // Reachable in a cycle back to AuthModule via CalendarModule
  // (AuthModule -> CalendarModule -> AiModule -> EmailModule -> AuthModule,
  // added for MeetingSchedulingController's AiClientService dependency).
  imports: [forwardRef(() => AuthModule), EmailAccountModule],

  controllers: [EmailController],

  providers: [
    MailProviderFactory,
    EmailSyncService,
    InboxService,
    ComposeService,
    EmailSyncProcessor,
  ],

  exports: [
    MailProviderFactory,
    EmailSyncService,
    InboxService,
    ComposeService,
  ],
})
export class EmailModule implements OnApplicationBootstrap {
  constructor(private readonly queueService: QueueService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queueService.scheduleBackgroundSync();
  }
}
