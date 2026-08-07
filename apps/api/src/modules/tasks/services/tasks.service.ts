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
  ): Promise<Task[]> {
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
      return [];
    }

    try {
      // create (not createMany) so callers get back the created rows'
      // IDs — the opt-in auto-schedule hook needs the MEETING_REQUEST
      // task ID to act on immediately after extraction.
      return await this.prisma.$transaction(
        rows.map((row) =>
          this.prisma.task.create({
            data: {
              userId,
              emailMessageId: messageId,
              threadId,
              type: row.type,
              description: row.description,
            },
          }),
        ),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to persist extracted tasks for message ${messageId}: ${String(error)}`,
      );
      return [];
    }
  }

  /** A task is visible to whoever it was extracted for (Task.userId,
   * always the account owner — see createFromExtraction) *or* anyone with
   * Shared Inbox access to the source thread's account. Tasks with no
   * threadId (none currently, but the field is nullable) fall back to
   * userId-only, same as before Shared Inbox existed. */
  private accessibleTaskWhere(userId: string) {
    return {
      OR: [
        { userId },
        { thread: { account: { members: { some: { userId } } } } },
      ],
    };
  }

  async listForUser(userId: string, filters?: TaskFilters): Promise<Task[]> {
    return this.prisma.task.findMany({
      where: {
        ...this.accessibleTaskWhere(userId),
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
    // updateMany scoped by accessibleTaskWhere avoids a check-then-update
    // race and never throws for a task the user can't reach — it just
    // matches zero rows, which we then report as 404 (same pattern as
    // DocumentsService.remove()).
    const { count } = await this.prisma.task.updateMany({
      where: { id: taskId, ...this.accessibleTaskWhere(userId) },
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

  /** Includes the source EmailMessage's `from` field so callers (meeting
   * scheduling) can default the attendee to whoever sent the original
   * request, without a second round trip. */
  async getOwnedTaskWithMessage(userId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, ...this.accessibleTaskWhere(userId) },
      include: {
        emailMessage: {
          select: { from: true, subject: true, bodyText: true },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  async setScheduledEvent(
    taskId: string,
    event: { calendarEventId: string; calendarEventUrl: string },
  ): Promise<Task> {
    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        calendarEventId: event.calendarEventId,
        calendarEventUrl: event.calendarEventUrl,
        status: 'DONE',
        completedAt: new Date(),
      },
    });
  }
}
