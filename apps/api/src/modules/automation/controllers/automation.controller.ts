import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { AutomationService } from '../services/automation.service';

@ApiTags('automation')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('email-accounts/:accountId/automation-log')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get()
  @ApiOperation({
    summary:
      "An account's automation audit log: autonomous sends and rule runs, newest first (owner only)",
  })
  @ApiQuery({ name: 'before', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Log entries' })
  async list(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Query('before') before?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    const beforeDate = before ? new Date(before) : undefined;
    return this.automationService.getAuditLog(user.sub, accountId, {
      before:
        beforeDate && !Number.isNaN(beforeDate.getTime())
          ? beforeDate
          : undefined,
      limit,
    });
  }
}
