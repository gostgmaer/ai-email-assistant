import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser, JwtAuthGuard, JwtPayload } from '../../auth';
import { GetAvailabilityDto } from '../dto';
import { CalendarAccountService } from '../services/calendar-account.service';
import { CalendarService } from '../services/calendar.service';

@ApiTags('calendar')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly calendarAccountService: CalendarAccountService,
  ) {}

  @Get(':accountId/availability')
  @ApiOperation({
    summary:
      'Look up busy intervals on a connected calendar within a time window',
  })
  @ApiResponse({ status: 200, description: 'Busy intervals' })
  @ApiResponse({ status: 404, description: 'Calendar account not found' })
  async getAvailability(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Query() query: GetAvailabilityDto,
  ) {
    const account = await this.calendarAccountService.getOwnedAccountOrThrow(
      user.sub,
      accountId,
    );

    return this.calendarService.getFreeBusy(
      accountId,
      account.provider,
      new Date(query.timeMin),
      new Date(query.timeMax),
    );
  }
}
