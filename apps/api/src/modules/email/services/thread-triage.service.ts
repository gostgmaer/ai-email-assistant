import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../database';
import { decideTriage } from '../utils/triage.util';

// Threads triaged per backfill pass — each is two small queries.
const BACKFILL_BATCH_SIZE = 200;

/**
 * Keeps EmailThread.triage in step with the thread's newest message (see
 * decideTriage). Called by sync when a message lands and by the AI
 * pipeline once it has decided needsReply; the triage scan fills in
 * threads that were never triaged (history from before this existed).
 */
@Injectable()
export class ThreadTriageService {
  private readonly logger = new Logger(ThreadTriageService.name);

  constructor(private readonly prisma: PrismaService) {}

  async refresh(threadId: string): Promise<void> {
    const thread = await this.prisma.emailThread.findUnique({
      where: { id: threadId },
      select: {
        account: { select: { email: true, aliases: true } },
        messages: {
          orderBy: { receivedAt: 'desc' },
          take: 1,
          select: {
            from: true,
            to: true,
            cc: true,
            bodyText: true,
            bodyHtml: true,
            isAutoReply: true,
            bulkKind: true,
            category: true,
            needsReply: true,
          },
        },
      },
    });
    const latest = thread?.messages[0];
    if (!latest) {
      return;
    }

    await this.prisma.emailThread.update({
      where: { id: threadId },
      data: {
        triage: decideTriage(latest, [
          thread.account.email,
          ...thread.account.aliases,
        ]),
      },
    });
  }

  /** Same as refresh(), but a failure is logged rather than thrown — for
   * callers (sync, the AI pipeline) whose own work must not fail over it. */
  async refreshQuietly(threadId: string): Promise<void> {
    try {
      await this.refresh(threadId);
    } catch (error: unknown) {
      this.logger.warn(
        { err: error },
        `Couldn't update triage for thread ${threadId}`,
      );
    }
  }

  /** Triages up to one batch of never-triaged threads, newest first.
   * Returns how many it did, so the scan knows whether to keep going. */
  async backfill(): Promise<number> {
    const threads = await this.prisma.emailThread.findMany({
      where: {
        triage: null,
        account: { deletedAt: null },
        // Local drafts aren't conversations.
        folder: { type: { not: 'DRAFTS' } },
        messages: { some: {} },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: BACKFILL_BATCH_SIZE,
      select: { id: true },
    });

    for (const { id } of threads) {
      await this.refreshQuietly(id);
    }
    return threads.length;
  }
}
