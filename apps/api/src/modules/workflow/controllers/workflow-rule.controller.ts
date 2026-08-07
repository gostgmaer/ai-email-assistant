import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { CreateWorkflowRuleDto, UpdateWorkflowRuleDto } from '../dto';
import { WorkflowRuleService } from '../services/workflow-rule.service';

/**
 * Routed under /email-accounts/:accountId/workflow-rules rather than its
 * own top-level path — rules are account configuration, same tier as
 * members/filters, and this keeps every account-scoped resource under
 * one prefix.
 */
@ApiTags('workflow-rules')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('email-accounts/:accountId/workflow-rules')
export class WorkflowRuleController {
  constructor(private readonly workflowRuleService: WorkflowRuleService) {}

  @Get()
  @ApiOperation({ summary: "List an account's workflow rules" })
  @ApiResponse({ status: 200, description: 'The workflow rules' })
  async list(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
  ) {
    return this.workflowRuleService.listForAccount(user.sub, accountId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a workflow rule (owner only)' })
  @ApiResponse({ status: 201, description: 'The created rule' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Body() dto: CreateWorkflowRuleDto,
  ) {
    return this.workflowRuleService.create(user.sub, accountId, dto);
  }

  @Patch(':ruleId')
  @ApiOperation({ summary: 'Update a workflow rule (owner only)' })
  @ApiResponse({ status: 200, description: 'The updated rule' })
  @ApiResponse({ status: 404, description: 'Rule not found' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateWorkflowRuleDto,
  ) {
    return this.workflowRuleService.update(user.sub, accountId, ruleId, dto);
  }

  @Delete(':ruleId')
  @ApiOperation({ summary: 'Delete a workflow rule (owner only)' })
  @ApiResponse({ status: 200, description: 'The rule was deleted' })
  async delete(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('ruleId') ruleId: string,
  ) {
    await this.workflowRuleService.delete(user.sub, accountId, ruleId);
    return { success: true };
  }
}
