import { Module } from '@nestjs/common';

import { AuthModule } from '../auth';
import { JobsController } from './controllers/jobs.controller';

@Module({
  imports: [AuthModule],
  controllers: [JobsController],
})
export class JobsModule {}
