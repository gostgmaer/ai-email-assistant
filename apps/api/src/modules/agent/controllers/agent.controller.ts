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
import { CreateAgentDto, UpdateAgentDto } from '../dto';
import { AgentService } from '../services/agent.service';

/**
 * Routed under /email-accounts/:accountId/agents, matching
 * WorkflowRuleController — agents are account configuration.
 */
@ApiTags('agents')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('email-accounts/:accountId/agents')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get()
  @ApiOperation({ summary: "List an account's AI agent personas" })
  @ApiResponse({ status: 200, description: 'The agents' })
  async list(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
  ) {
    return this.agentService.listForAccount(user.sub, accountId);
  }

  @Post()
  @ApiOperation({ summary: 'Create an AI agent persona (owner only)' })
  @ApiResponse({ status: 201, description: 'The created agent' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Body() dto: CreateAgentDto,
  ) {
    return this.agentService.create(user.sub, accountId, dto);
  }

  @Patch(':agentId')
  @ApiOperation({ summary: 'Update an AI agent persona (owner only)' })
  @ApiResponse({ status: 200, description: 'The updated agent' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('agentId') agentId: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.agentService.update(user.sub, accountId, agentId, dto);
  }

  @Delete(':agentId')
  @ApiOperation({ summary: 'Delete an AI agent persona (owner only)' })
  @ApiResponse({ status: 200, description: 'The agent was deleted' })
  async delete(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('agentId') agentId: string,
  ) {
    await this.agentService.delete(user.sub, accountId, agentId);
    return { success: true };
  }
}
