import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth';
import { TasksController } from './controllers/tasks.controller';
import { TasksService } from './services/tasks.service';

@Module({
  // Reachable in a cycle back to AuthModule via CalendarModule
  // (AuthModule -> CalendarModule -> TasksModule -> AuthModule, added for
  // MeetingSchedulingController) as well as via AiModule
  // (AiModule -> TasksModule for extraction, AuthModule -> CalendarModule
  // -> AiModule) — forwardRef() here breaks both.
  imports: [forwardRef(() => AuthModule)],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
