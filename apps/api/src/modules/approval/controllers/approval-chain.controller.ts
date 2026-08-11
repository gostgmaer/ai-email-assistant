import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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
import { DecideApprovalStepDto } from '../dto';
import { ApprovalChainService } from '../services/approval-chain.service';

@ApiTags('approval-chains')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('approval-chains')
export class ApprovalChainController {
  constructor(private readonly approvalChainService: ApprovalChainService) {}

  @Get('mine')
  @ApiOperation({
    summary: "List approval chains awaiting this user's decision",
  })
  @ApiResponse({ status: 200, description: 'The pending chains' })
  async mine(@CurrentUser() user: JwtPayload) {
    return this.approvalChainService.listPendingForUser(user.sub);
  }

  @Get('by-draft/:draftMessageId')
  @ApiOperation({
    summary: 'Get the approval chain gating a specific draft, if any',
  })
  @ApiResponse({
    status: 200,
    description: 'The chain, or null if this draft has none',
  })
  async byDraft(
    @CurrentUser() user: JwtPayload,
    @Param('draftMessageId') draftMessageId: string,
  ) {
    return this.approvalChainService.getForDraft(user.sub, draftMessageId);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: "Approve this user's current step in the chain" })
  @ApiResponse({ status: 200, description: 'The updated chain' })
  async approve(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: DecideApprovalStepDto,
  ) {
    return this.approvalChainService.approve(user.sub, id, dto.comment);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: "Reject this user's current step in the chain" })
  @ApiResponse({ status: 200, description: 'The updated chain' })
  async reject(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: DecideApprovalStepDto,
  ) {
    return this.approvalChainService.reject(user.sub, id, dto.comment);
  }
}
