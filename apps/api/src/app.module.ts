import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import configuration from './config/configuration';
import { PrismaModule } from './database';
import { HealthModule } from './modules/health/health.module';
import { AppLoggerModule } from './infrastructure/logger/logger.module';
import { RedisModule } from './infrastructure/redis';
import { QueueModule } from './infrastructure/queue';
import { EncryptionModule } from './infrastructure/encryption';
import { MailerModule } from './infrastructure/mailer';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users';
import { EmailAccountModule } from './modules/email-account';
import { EmailModule } from './modules/email';
import { AiModule } from './modules/ai';
import { CalendarModule } from './modules/calendar';
import { DigestModule } from './modules/digest';
import { DocumentsModule } from './modules/documents';
import { JobsModule } from './modules/jobs';
import { NotificationModule } from './modules/notification';
import { TasksModule } from './modules/tasks';
import { WorkflowModule } from './modules/workflow';
import { AgentModule } from './modules/agent';
import { CrmModule } from './modules/crm';
import { IntegrationModule } from './modules/integration';
import { ApprovalModule } from './modules/approval';
import { AutomationModule } from './modules/automation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: '.env',
      load: [configuration],
    }),
    // Registers the ThrottlerStorage/options ThrottlerGuard depends on.
    // Scoped intentionally: only auth.controller.ts applies the guard
    // (via @UseGuards(ThrottlerGuard) + @Throttle(...)), so this does not
    // rate-limit the rest of the API.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60000, limit: 20 },
    ]),
    AppLoggerModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    EncryptionModule,
    MailerModule,
    HealthModule,
    AuthModule,
    UsersModule,
    EmailAccountModule,
    EmailModule,
    CalendarModule,
    AiModule,
    DocumentsModule,
    JobsModule,
    NotificationModule,
    TasksModule,
    DigestModule,
    WorkflowModule,
    AgentModule,
    CrmModule,
    IntegrationModule,
    ApprovalModule,
    AutomationModule,
  ],
})
export class AppModule {}
