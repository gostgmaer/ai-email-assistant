import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser, JwtAuthGuard, JwtPayload } from '../../auth';
import { ListTasksDto, UpdateTaskDto } from '../dto';
import { TasksService } from '../services/tasks.service';

@ApiTags('tasks')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @ApiOperation({
    summary:
      "List action items and meeting requests extracted from the user's emails",
  })
  @ApiResponse({ status: 200, description: "The user's tasks" })
  async list(@CurrentUser() user: JwtPayload, @Query() query: ListTasksDto) {
    return this.tasksService.listForUser(user.sub, { status: query.status });
  }

  @Patch(':id')
  @ApiOperation({ summary: "Update a task's status (done/dismissed/pending)" })
  @ApiResponse({ status: 200, description: 'The updated task' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateTaskDto,
  ) {
    return this.tasksService.updateStatus(user.sub, id, body.status);
  }
}
