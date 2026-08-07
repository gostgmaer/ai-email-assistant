import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../database';
import { Prisma } from '../../../generated/prisma/client';
import { ListThreadsDto } from '../dto';
import { NormalizedParticipant } from '../interfaces';
import { MailProviderFactory } from '../providers/mail-provider.factory';

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailProviderFactory: MailProviderFactory,
  ) {}

  async listThreads(userId: string, query: ListThreadsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const now = new Date();

    // Each optional filter is its own AND-array entry (rather than spread
    // directly onto `where`) because both the free-text search and the
    // default snooze exclusion need an OR clause of their own — two `OR`
    // keys spread onto the same object would collide, silently dropping
    // one of them.
    const conditions: Prisma.EmailThreadWhereInput[] = [];

    if (query.q) {
      conditions.push({
        OR: [
          { subject: { contains: query.q, mode: 'insensitive' } },
          { snippet: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }

    // Matches if ANY message in the thread was classified at this
    // priority, not just the latest one — precise "current priority"
    // filtering would need the latest message's priority denormalized
    // onto EmailThread, which isn't there yet. Good enough for a first
    // pass; see docs/v1.2-plan.md's Priority Inbox section.
    if (query.priority) {
      conditions.push({ messages: { some: { priority: query.priority } } });
    }

    // Default view excludes snoozed threads; snoozed=true flips to
    // showing only them. Nothing actively "wakes up" a snoozed thread —
    // once snoozedUntil passes it just stops matching the `gt: now` branch
    // and naturally reappears in the default view. The default branch is
    // written as an explicit OR (not `NOT: { snoozedUntil: { gt: now } }`)
    // because SQL's three-valued NULL logic means a plain negation would
    // exclude never-snoozed (NULL) threads too, not just currently-active
    // ones.
    conditions.push(
      query.snoozed
        ? { snoozedUntil: { gt: now } }
        : { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] },
    );

    const where: Prisma.EmailThreadWhereInput = {
      account: {
        id: query.accountId,
        userId,
        deletedAt: null,
      },
      folder: {
        type: query.folderType ?? 'INBOX',
      },
      AND: conditions,
    };

    const [threads, total] = await this.prisma.$transaction([
      this.prisma.emailThread.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          folder: {
            select: {
              id: true,
              type: true,
              name: true,
              accountId: true,
              account: { select: { id: true, provider: true, email: true } },
            },
          },
          messages: {
            orderBy: { receivedAt: 'desc' },
            take: 1,
          },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.emailThread.count({ where }),
    ]);

    return {
      threads,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** updateMany scoped by userId (via a nested relation filter) avoids a
   * check-then-update race and never throws for another user's thread —
   * it just matches zero rows, reported as 404 (same pattern as
   * DocumentsService.remove() / TasksService.updateStatus()). */
  async snooze(userId: string, threadId: string, until: Date): Promise<void> {
    const { count } = await this.prisma.emailThread.updateMany({
      where: { id: threadId, account: { userId } },
      data: { snoozedUntil: until },
    });

    if (count === 0) {
      throw new NotFoundException('Thread not found');
    }
  }

  async unsnooze(userId: string, threadId: string): Promise<void> {
    const { count } = await this.prisma.emailThread.updateMany({
      where: { id: threadId, account: { userId } },
      data: { snoozedUntil: null },
    });

    if (count === 0) {
      throw new NotFoundException('Thread not found');
    }
  }

  /**
   * Heuristic follow-up suggestions (see docs/v1.2-plan.md): threads where
   * the user sent the most recent message and nothing has come back in
   * `olderThanDays` — not an AI capability, this is deliberately a rules
   * pass over data that's already there (the account's own address vs. the
   * latest message's sender), reusing extracted meeting_requests/tasks as
   * a secondary signal rather than a fresh LLM call per thread.
   *
   * "Sent the last message" can't be expressed as a DB-level filter — a
   * thread's `folder` is fixed at creation (see EmailThread.folderId's
   * comment) and doesn't move when the user replies from an Inbox
   * conversation, so the only reliable signal is comparing the latest
   * message's `from` address against the account's own email. That means
   * this filters in application code after a bounded fetch, not via SQL.
   */
  async getFollowUpCandidates(userId: string, olderThanDays = 3) {
    const threshold = new Date(
      Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
    );

    const threads = await this.prisma.emailThread.findMany({
      where: {
        account: { userId, deletedAt: null },
        lastMessageAt: { lt: threshold },
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }],
      },
      include: {
        account: { select: { id: true, provider: true, email: true } },
        messages: { orderBy: { receivedAt: 'desc' }, take: 1 },
        tasks: {
          where: { type: 'MEETING_REQUEST', status: 'PENDING' },
          select: { id: true, description: true },
        },
      },
      orderBy: { lastMessageAt: 'asc' },
      take: 50,
    });

    return threads
      .filter((thread) => {
        const latest = thread.messages[0];
        if (!latest) return false;
        const sender = firstParticipant(latest.from);
        return (
          sender?.address.toLowerCase() === thread.account.email.toLowerCase()
        );
      })
      .map((thread) => ({
        threadId: thread.id,
        subject: thread.subject,
        lastMessageAt: thread.lastMessageAt,
        daysSinceLastMessage: thread.lastMessageAt
          ? Math.floor(
              (Date.now() - thread.lastMessageAt.getTime()) /
                (24 * 60 * 60 * 1000),
            )
          : null,
        account: thread.account,
        relatedMeetingRequests: thread.tasks,
      }));
  }

  async getThread(userId: string, threadId: string) {
    const thread = await this.prisma.emailThread.findUnique({
      where: { id: threadId },
      include: {
        account: {
          select: { id: true, provider: true, email: true, userId: true },
        },
        folder: true,
        messages: { orderBy: { receivedAt: 'asc' } },
      },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    if (thread.account.userId !== userId) {
      throw new ForbiddenException('You do not have access to this thread');
    }

    return thread;
  }

  async getMessageOwned(userId: string, messageId: string) {
    const message = await this.prisma.emailMessage.findUnique({
      where: { id: messageId },
      include: {
        thread: {
          include: {
            account: { select: { id: true, provider: true, userId: true } },
            folder: true,
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.thread.account.userId !== userId) {
      throw new ForbiddenException('You do not have access to this message');
    }

    return message;
  }

  async markRead(userId: string, messageId: string): Promise<void> {
    const message = await this.getMessageOwned(userId, messageId);

    await this.prisma.emailMessage.update({
      where: { id: messageId },
      data: { isRead: true },
    });

    const account = message.thread.account;
    const client = await this.mailProviderFactory.createClient(
      await this.prisma.emailAccount.findUniqueOrThrow({
        where: { id: account.id },
      }),
    );

    await client.markAsRead(
      message.providerMessageId,
      message.thread.folder.providerFolderId ?? undefined,
    );
  }
}

function firstParticipant(from: unknown): NormalizedParticipant | undefined {
  const list = from as NormalizedParticipant[] | undefined;
  return Array.isArray(list) ? list[0] : undefined;
}
