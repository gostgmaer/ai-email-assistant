import { Module } from '@nestjs/common';

import { AuthModule } from '../auth';
import { CalendarModule } from '../calendar/calendar.module';
import { EmailAccountModule } from '../email-account/email-account.module';
import { UsersController } from './controllers/users.controller';
import { UsersService } from './services/users.service';

@Module({
  // Deleting an account disconnects the user's mailboxes and calendars
  // (UsersService.softDelete). Neither module imports this one, so no cycle.
  imports: [AuthModule, EmailAccountModule, CalendarModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
