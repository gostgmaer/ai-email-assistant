import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { loggerConfig } from './logger.config';

@Global()
@Module({
  imports: [LoggerModule.forRoot(loggerConfig)],
  exports: [LoggerModule],
})
export class AppLoggerModule {}
