import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { QueueNames } from './constants/queue.constants';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],

      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        },

        defaultJobOptions: {
          attempts: 3,

          removeOnComplete: 100,

          removeOnFail: 1000,

          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }),
    }),

    BullModule.registerQueue(
      {
        name: QueueNames.EmailSync,
      },
      {
        name: QueueNames.AI,
      },
      {
        name: QueueNames.Notification,
      },
    ),
  ],

  exports: [BullModule],
})
export class QueueModule {}
