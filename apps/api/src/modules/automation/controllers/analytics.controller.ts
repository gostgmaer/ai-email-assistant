import {
  Controller,
  Get,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

// Leaf-file imports rather than the '../../auth' barrel — see the comment
// in documents.controller.ts for why.
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AutomationMetricsService } from '../services/automation-metrics.service';

@ApiTags('analytics')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly metricsService: AutomationMetricsService) {}

  @Get('automation')
  @ApiOperation({
    summary:
      'AI draft quality for an account: acceptance, edit and rejection rates, edit distance, time to send — overall and per agent',
  })
  @ApiQuery({ name: 'accountId', required: true })
  @ApiQuery({ name: 'days', required: false, description: 'Default 30' })
  @ApiResponse({ status: 200, description: 'The metrics' })
  async automation(
    @CurrentUser() user: JwtPayload,
    @Query('accountId', ParseUUIDPipe) accountId: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    return this.metricsService.getMetrics(
      user.sub,
      accountId,
      Math.min(Math.max(days ?? 30, 1), 365),
    );
  }
}
