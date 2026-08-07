import {
  BadRequestException,
  Body,
  Controller,
  Logger,
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
import { ComposeService } from '../../email';
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

function formatEventTime(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateFmt = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full',
  });
  const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
  return `${dateFmt.format(start)}, ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
}

/**
 * Lives in CalendarModule rather than TasksModule: it needs TasksService,
 * CalendarAccountService/CalendarService, AiClientService, and
 * ComposeService all at once, and CalendarModule can import TasksModule +
 * AiModule + EmailModule as plain (non-circular) imports — putting this in
 * TasksModule instead would require TasksModule -> AiModule, which is
 * already circular the other way (AiModule already imports TasksModule for
 * extraction) and would need forwardRef(). Route paths still read as
 * /tasks/:id/... regardless of which module the controller is registered
 * in.
 */
@ApiTags('calendar')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class MeetingSchedulingController {
  private readonly logger = new Logger(MeetingSchedulingController.name);

  constructor(
    private readonly tasksService: TasksService,
    private readonly calendarAccountService: CalendarAccountService,
    private readonly calendarService: CalendarService,
    private readonly aiClientService: AiClientService,
    private readonly composeService: ComposeService,
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
      'Create the calendar event for a MEETING_REQUEST task with the given (user-reviewed) time — only ever called after explicit approval, never automatically. When an attendee is included, also replies in the original email thread confirming the time (same "notify this person" gate as the calendar invite — no reply is sent if attendeeEmail is omitted).',
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
    const originalTask = await this.tasksService.getOwnedTaskWithMessage(
      user.sub,
      id,
    );
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

    // Same gate as the calendar invite itself: only reply in the thread if
    // the user opted to notify this person at all. Best-effort — the
    // meeting is already successfully created at this point, so a reply
    // failure (e.g. the account's send quota, a since-deleted message)
    // must not turn a successful schedule into an error response.
    if (dto.attendeeEmail && originalTask.emailMessageId) {
      try {
        await this.composeService.reply(user.sub, {
          messageId: originalTask.emailMessageId,
          bodyHtml: `<p>I've scheduled our meeting — <strong>${dto.title}</strong> — for ${formatEventTime(dto.start, dto.end)}. You should receive a calendar invite separately.</p>`,
          bodyText: `I've scheduled our meeting — ${dto.title} — for ${formatEventTime(dto.start, dto.end)}. You should receive a calendar invite separately.`,
        });
      } catch (error) {
        this.logger.warn(
          `Meeting was scheduled but the confirmation reply failed for task ${id}: ${String(error)}`,
        );
      }
    }

    return { task, event };
  }
}
