import {
  Controller,
  Get,
  HttpCode,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { InsightsService } from '../services/insights.service';

@ApiTags('insights')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get()
  @ApiOperation({
    summary:
      "An account's pre-computed response times, workload and AI outcomes",
  })
  @ApiResponse({
    status: 200,
    description: '{ insights }, null until first computed',
  })
  async get(
    @CurrentUser() user: JwtPayload,
    @Query('accountId', ParseUUIDPipe) accountId: string,
  ) {
    return this.insightsService.get(user.sub, accountId);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Work the numbers out now instead of overnight' })
  @ApiResponse({ status: 200, description: 'The new numbers' })
  async refresh(
    @CurrentUser() user: JwtPayload,
    @Query('accountId', ParseUUIDPipe) accountId: string,
  ) {
    return this.insightsService.refreshForUser(user.sub, accountId);
  }
}
