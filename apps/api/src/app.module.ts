import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration from './config/configuration';
import { PrismaModule } from './infrastructure/database';
import { HealthModule } from './modules/health/health.module';
import { AppLoggerModule } from './infrastructure/logger/logger.module';
import { RedisModule } from './infrastructure/redis';
import { QueueModule } from './infrastructure/queue';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: '.env',
      load: [configuration],
    }),
    AppLoggerModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    HealthModule,
    AuthModule,
  ],
})
export class AppModule {}
