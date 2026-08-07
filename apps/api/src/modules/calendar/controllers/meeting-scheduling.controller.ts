import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser, JwtAuthGuard, JwtPayload } from '../../auth';
import { AiClientService } from '../../ai';
import { TasksService } from '../../tasks';
import { ScheduleMeetingDto } from '../dto';
import { CalendarAccountService } from '../services/calendar-account.service';
import { CalendarService } from '../services/calendar.service';

const AVAILABILITY_LOOKUP_DAYS = 14;

interface EmailParticipant {
  name?: string;
  address: string;
}

function firstParticipant(from: unknown): EmailParticipant | undefined {
  const list = from as EmailParticipant[] | undefined;
  return Array.isArray(list) ? list[0] : undefined;
}

/**
 * Lives in CalendarModule rather than TasksModule: it needs TasksService,
 * CalendarAccountService/CalendarService, and AiClientService all at once,
 * and CalendarModule can import TasksModule + AiModule as plain (non-
 * circular) imports — putting this in TasksModule instead would require
 * TasksModule -> AiModule, which is already circular the other way
 * (AiModule already imports TasksModule for extraction) and would need
 * forwardRef(). Route paths still read as /tasks/:id/... regardless of
 * which module the controller is registered in.
 */
@ApiTags('calendar')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class MeetingSchedulingController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly calendarAccountService: CalendarAccountService,
    private readonly calendarService: CalendarService,
    private readonly aiClientService: AiClientService,
  ) {}

  @Post(':id/suggest-meeting')
  @ApiOperation({
    summary:
      'Suggest a concrete time for a MEETING_REQUEST task, avoiding busy intervals on the primary connected calendar — suggestion only, nothing is written to the calendar',
  })
  @ApiResponse({ status: 200, description: 'The suggested time slot' })
  @ApiResponse({ status: 400, description: 'Task is not a meeting request' })
  @ApiResponse({
    status: 404,
    description: 'Task not found, or no calendar connected',
  })
  async suggestMeeting(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const task = await this.tasksService.getOwnedTaskWithMessage(user.sub, id);

    if (task.type !== 'MEETING_REQUEST') {
      throw new BadRequestException('This task is not a meeting request');
    }

    const accounts = await this.calendarAccountService.listForUser(user.sub);
    const account = accounts.find((a) => a.isPrimary) ?? accounts[0];

    if (!account) {
      throw new NotFoundException(
        'Connect a calendar before requesting a meeting time suggestion',
      );
    }

    const now = new Date();
    const lookupEnd = new Date(
      now.getTime() + AVAILABILITY_LOOKUP_DAYS * 24 * 60 * 60 * 1000,
    );

    const busy = await this.calendarService.getFreeBusy(
      account.id,
      account.provider,
      now,
      lookupEnd,
    );

    const { suggestion } = await this.aiClientService.suggestMeetingTime(
      task.description,
      now.toISOString(),
      busy,
    );

    return {
      ...suggestion,
      calendarAccountId: account.id,
      suggestedAttendeeEmail: firstParticipant(task.emailMessage?.from)
        ?.address,
    };
  }

  @Post(':id/schedule-meeting')
  @ApiOperation({
    summary:
      'Create the calendar event for a MEETING_REQUEST task with the given (user-reviewed) time — only ever called after explicit approval, never automatically',
  })
  @ApiResponse({
    status: 201,
    description: 'The created event and updated task',
  })
  @ApiResponse({
    status: 404,
    description: 'Task or calendar account not found',
  })
  async scheduleMeeting(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ScheduleMeetingDto,
  ) {
    await this.tasksService.getOwnedTaskWithMessage(user.sub, id);
    const account = await this.calendarAccountService.getOwnedAccountOrThrow(
      user.sub,
      dto.calendarAccountId,
    );

    const event = await this.calendarService.createEvent(
      account.id,
      account.provider,
      {
        summary: dto.title,
        start: dto.start,
        end: dto.end,
        attendeeEmail: dto.attendeeEmail,
      },
    );

    const task = await this.tasksService.setScheduledEvent(id, {
      calendarEventId: event.id,
      calendarEventUrl: event.htmlLink,
    });

    return { task, event };
  }
}
