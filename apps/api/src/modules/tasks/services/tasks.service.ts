import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../database';
import { Task, TaskStatus } from '../../../generated/prisma/client';
import type { ExtractionResult } from '../../ai';

export interface TaskFilters {
  status?: TaskStatus;
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists the /email/extract capability's output — apps/ai already
   * computes `tasks` and `meeting_requests` on every processed message,
   * this is what stops that output from being discarded (see
   * docs/v1.2-plan.md's "AI Task Extraction" section). Best-effort: called
   * from AiProcessingProcessor after the main reply-generation pipeline
   * already succeeded, so a failure here must never throw back into it.
   */
  async createFromExtraction(
    userId: string,
    messageId: string,
    threadId: string,
    extraction: ExtractionResult,
  ): Promise<void> {
    const rows = [
      ...extraction.tasks.map((description) => ({
        type: 'ACTION_ITEM' as const,
        description,
      })),
      ...extraction.meetingRequests.map((description) => ({
        type: 'MEETING_REQUEST' as const,
        description,
      })),
    ].filter((row) => row.description.trim().length > 0);

    if (rows.length === 0) {
      return;
    }

    try {
      await this.prisma.task.createMany({
        data: rows.map((row) => ({
          userId,
          emailMessageId: messageId,
          threadId,
          type: row.type,
          description: row.description,
        })),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist extracted tasks for message ${messageId}: ${String(error)}`,
      );
    }
  }

  async listForUser(userId: string, filters?: TaskFilters): Promise<Task[]> {
    return this.prisma.task.findMany({
      where: {
        userId,
        ...(filters?.status ? { status: filters.status } : {}),
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async updateStatus(
    userId: string,
    taskId: string,
    status: TaskStatus,
  ): Promise<Task> {
    // updateMany scoped by userId avoids a check-then-update race and never
    // throws for another user's task — it just matches zero rows, which we
    // then report as 404 (same pattern as DocumentsService.remove()).
    const { count } = await this.prisma.task.updateMany({
      where: { id: taskId, userId },
      data: {
        status,
        completedAt: status === 'DONE' ? new Date() : null,
      },
    });

    if (count === 0) {
      throw new NotFoundException('Task not found');
    }

    return this.prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  }
}
