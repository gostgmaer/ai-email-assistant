import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

// Leaf-file imports rather than the '../../auth' barrel — see the comment
// in documents.controller.ts for why.
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ScheduleMeetingDto } from '../dto';
import { MeetingSchedulingService } from '../services/meeting-scheduling.service';

/**
 * Lives in CalendarModule rather than TasksModule: MeetingSchedulingService
 * needs TasksService, CalendarAccountService/CalendarService,
 * AiClientService, and ComposeService all at once, and CalendarModule can
 * import TasksModule + AiModule + EmailModule as plain (non-circular)
 * imports — putting this in TasksModule instead would require
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
    private readonly meetingSchedulingService: MeetingSchedulingService,
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
    return this.meetingSchedulingService.suggestTime(user.sub, id);
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
    return this.meetingSchedulingService.schedule(user.sub, id, dto);
  }
}
