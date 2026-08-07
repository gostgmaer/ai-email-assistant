import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  QueueName,
  QueueNames,
  QueueService,
} from '../../../infrastructure/queue';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

const QUEUE_NAME_VALUES: string[] = Object.values(QueueNames);

@ApiTags('jobs')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly queueService: QueueService) {}

  @Get(':queueName/counts')
  @ApiParam({ name: 'queueName', enum: QUEUE_NAME_VALUES })
  @ApiOperation({ summary: 'Get job counts for a queue' })
  @ApiResponse({
    status: 200,
    description: 'Waiting/active/completed/failed counts',
  })
  async getCounts(@Param('queueName') queueName: string) {
    return this.getQueueOrThrow(queueName).getJobCounts();
  }

  @Get(':queueName/failed')
  @ApiParam({ name: 'queueName', enum: QUEUE_NAME_VALUES })
  @ApiOperation({ summary: 'List failed jobs for a queue' })
  @ApiResponse({ status: 200, description: 'The failed jobs' })
  async listFailed(@Param('queueName') queueName: string) {
    const jobs = await this.getQueueOrThrow(queueName).getFailed(0, 50);

    return jobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data as unknown,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
    }));
  }

  @Post(':queueName/:jobId/retry')
  @ApiParam({ name: 'queueName', enum: QUEUE_NAME_VALUES })
  @ApiOperation({ summary: 'Retry a failed job' })
  @ApiResponse({ status: 201, description: 'The job was re-enqueued' })
  async retry(
    @Param('queueName') queueName: string,
    @Param('jobId') jobId: string,
  ) {
    const queue = this.getQueueOrThrow(queueName);
    const job = await queue.getJob(jobId);

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    await job.retry();

    return { success: true };
  }

  private getQueueOrThrow(queueName: string) {
    if (!QUEUE_NAME_VALUES.includes(queueName)) {
      throw new BadRequestException(`Unknown queue: ${queueName}`);
    }

    return this.queueService.getQueue(queueName as QueueName);
  }
}
