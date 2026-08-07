import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
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
      account.email,
      new Date(query.timeMin),
      new Date(query.timeMax),
    );
  }
}
