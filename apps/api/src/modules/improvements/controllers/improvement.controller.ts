import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
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
import { ImprovementService } from '../services/improvement.service';

@ApiTags('suggestions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('email-accounts/:accountId/suggestions')
export class ImprovementController {
  constructor(private readonly improvementService: ImprovementService) {}

  @Get()
  @ApiOperation({ summary: "An account's suggested changes to the AI" })
  @ApiResponse({ status: 200, description: 'The suggestions' })
  async list(
    @CurrentUser() user: JwtPayload,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ) {
    return this.improvementService.list(user.sub, accountId);
  }

  @Post('analyze')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Look for patterns in AI draft outcomes now, instead of waiting for the weekly run',
  })
  @ApiResponse({ status: 200, description: 'How many suggestions were added' })
  async analyze(
    @CurrentUser() user: JwtPayload,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ) {
    return this.improvementService.analyzeForOwner(user.sub, accountId);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Apply a suggestion to the agent or rules' })
  @ApiResponse({ status: 200, description: 'The decided suggestion' })
  @ApiResponse({ status: 409, description: 'Already decided' })
  async approve(
    @CurrentUser() user: JwtPayload,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.improvementService.approve(user.sub, accountId, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Hide a suggestion without changing anything' })
  @ApiResponse({ status: 200, description: 'The decided suggestion' })
  @ApiResponse({ status: 409, description: 'Already decided' })
  async reject(
    @CurrentUser() user: JwtPayload,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.improvementService.reject(user.sub, accountId, id);
  }
}
