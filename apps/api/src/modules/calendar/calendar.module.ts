import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { AiModule } from '../ai';
import { AuthModule } from '../auth';
import { EmailModule } from '../email';
import { EmailAccountModule } from '../email-account';
import { TasksModule } from '../tasks';
import { CalendarAccountController } from './controllers/calendar-account.controller';
import { CalendarController } from './controllers/calendar.controller';
import { MeetingSchedulingController } from './controllers/meeting-scheduling.controller';
import { GoogleCalendarConnectGuard } from './guards/google-calendar-connect.guard';
import { MicrosoftCalendarConnectGuard } from './guards/microsoft-calendar-connect.guard';
import { CalendarAccountService } from './services/calendar-account.service';
import { CalendarService } from './services/calendar.service';
import { GoogleCalendarConnectStrategy } from './strategies/google-calendar-connect.strategy';
import { MicrosoftCalendarConnectStrategy } from './strategies/microsoft-calendar-connect.strategy';

@Module({
  // AuthController (in AuthModule) auto-connects a calendar from the login
  // OAuth grant, so AuthModule imports this module too — forwardRef() on
  // both sides breaks the resulting cycle. TasksModule/AiModule are plain
  // imports (needed by MeetingSchedulingController) — neither imports
  // CalendarModule back, so no cycle there.
  imports: [
    ConfigModule,
    PassportModule,
    forwardRef(() => AuthModule),
    EmailAccountModule,
    EmailModule,
    TasksModule,
    AiModule,
  ],

  controllers: [
    CalendarAccountController,
    CalendarController,
    MeetingSchedulingController,
  ],

  providers: [
    CalendarAccountService,
    CalendarService,
    GoogleCalendarConnectStrategy,
    MicrosoftCalendarConnectStrategy,
    GoogleCalendarConnectGuard,
    MicrosoftCalendarConnectGuard,
  ],

  exports: [CalendarAccountService],
})
export class CalendarModule {}
