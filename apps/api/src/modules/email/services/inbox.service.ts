import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../database';
import { Prisma } from '../../../generated/prisma/client';
import { QueueService } from '../../../infrastructure/queue';
// Leaf-file import rather than the '../../email-account' barrel — see
// the comment in documents.controller.ts for why (avoids a Jest-only
// circular require).
import { EmailAccountService } from '../../email-account/services/email-account.service';
import { ListThreadsDto } from '../dto';
import { MailProviderFactory } from '../providers/mail-provider.factory';

const DAY_MS = 24 * 60 * 60 * 1000;

// Threads one "Clean up" request archives — each is a provider call per
// message, so a bigger backlog takes a few clicks rather than one long
// request.
const CLEANUP_BATCH = 100;

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailProviderFactory: MailProviderFactory,
    private readonly emailAccountService: EmailAccountService,
    private readonly queueService: QueueService,
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

    if (query.triage) {
      conditions.push({ triage: query.triage });
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
        members: { some: { userId } },
        deletedAt: null,
      },
      // The snoozed view spans every folder unless one is asked for:
      // snoozing doesn't move a thread, so a snoozed Sent or custom-folder
      // thread would otherwise be unreachable. Local drafts are never
      // snoozed conversations.
      folder: query.folderType
        ? { type: query.folderType }
        : query.snoozed
          ? { type: { not: 'DRAFTS' } }
          : { type: 'INBOX' },
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
          assignedTo: {
            select: { id: true, email: true, displayName: true },
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

  /**
   * Smart triage tab counts: the default inbox view (INBOX folder, not
   * snoozed) grouped by EmailThread.triage. Threads not triaged yet count
   * only toward `all`.
   */
  async getTriageCounts(userId: string, accountId?: string) {
    const now = new Date();
    const where: Prisma.EmailThreadWhereInput = {
      account: {
        id: accountId,
        members: { some: { userId } },
        deletedAt: null,
      },
      folder: { type: 'INBOX' },
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
    };
    const groups = await this.prisma.emailThread.groupBy({
      by: ['triage'],
      where,
      _count: { _all: true },
    });

    const counts = {
      all: 0,
      NEEDS_REPLY: 0,
      FYI: 0,
      NOTIFICATION: 0,
      NEWSLETTER: 0,
    };
    for (const group of groups) {
      counts.all += group._count._all;
      if (group.triage) {
        counts[group.triage] = group._count._all;
      }
    }
    return counts;
  }

  /** The inbox newsletter threads "Clean up" would archive: nothing newer
   * than olderThanDays, on accounts the user may change (owner or member —
   * same as rules acting on the mailbox). */
  private cleanupWhere(
    userId: string,
    olderThanDays: number,
    accountId?: string,
  ): Prisma.EmailThreadWhereInput {
    return {
      account: {
        id: accountId,
        members: { some: { userId } },
        deletedAt: null,
      },
      folder: { type: 'INBOX' },
      triage: 'NEWSLETTER',
      lastMessageAt: { lt: new Date(Date.now() - olderThanDays * DAY_MS) },
    };
  }

  async previewNewsletterCleanup(
    userId: string,
    olderThanDays: number,
    accountId?: string,
  ): Promise<{ count: number }> {
    return {
      count: await this.prisma.emailThread.count({
        where: this.cleanupWhere(userId, olderThanDays, accountId),
      }),
    };
  }

  /**
   * "Clean up": archives old newsletter threads at the provider (each
   * message, like the ARCHIVE rule action) and files them under the local
   * Archive folder. At most CLEANUP_BATCH threads per call; a thread that
   * fails is left in the inbox and counted, never half-moved locally.
   */
  async cleanupNewsletters(
    userId: string,
    olderThanDays: number,
    accountId?: string,
  ): Promise<{ archived: number; failed: number; remaining: number }> {
    const where = this.cleanupWhere(userId, olderThanDays, accountId);
    const threads = await this.prisma.emailThread.findMany({
      where,
      orderBy: { lastMessageAt: 'asc' },
      take: CLEANUP_BATCH,
      include: {
        account: true,
        folder: { select: { providerFolderId: true } },
        messages: { select: { id: true, providerMessageId: true } },
      },
    });

    let archived = 0;
    let failed = 0;
    for (const thread of threads) {
      try {
        const client = await this.mailProviderFactory.createClient(
          thread.account,
        );
        if (!client.archiveMessage) {
          failed++;
          continue;
        }
        for (const message of thread.messages) {
          const newProviderId = await client.archiveMessage(
            message.providerMessageId,
            thread.folder.providerFolderId ?? undefined,
          );
          if (newProviderId && newProviderId !== message.providerMessageId) {
            await this.prisma.emailMessage.update({
              where: { id: message.id },
              data: { providerMessageId: newProviderId },
            });
          }
        }
        const archive = await this.findOrCreateArchiveFolder(thread.accountId);
        await this.prisma.emailThread.update({
          where: { id: thread.id },
          data: { folderId: archive.id },
        });
        archived++;
      } catch (error: unknown) {
        failed++;
        this.logger.warn(
          { err: error },
          `Clean up couldn't archive thread ${thread.id}`,
        );
      }
    }

    const remaining = await this.prisma.emailThread.count({ where });
    return { archived, failed, remaining };
  }

  private async findOrCreateArchiveFolder(accountId: string) {
    return (
      (await this.prisma.mailFolder.findFirst({
        where: { accountId, type: 'ARCHIVE' },
      })) ??
      this.prisma.mailFolder.create({
        data: { accountId, type: 'ARCHIVE', name: 'Archive' },
      })
    );
  }

  /** updateMany scoped by userId (via a nested relation filter) avoids a
   * check-then-update race and never throws for another user's thread —
   * it just matches zero rows, reported as 404 (same pattern as
   * DocumentsService.remove() / TasksService.updateStatus()). */
  async snooze(userId: string, threadId: string, until: Date): Promise<void> {
    const { count } = await this.prisma.emailThread.updateMany({
      where: { id: threadId, account: { members: { some: { userId } } } },
      data: { snoozedUntil: until },
    });

    if (count === 0) {
      throw new NotFoundException('Thread not found');
    }

    await this.queueService.enqueueSnoozeWake(threadId, until);
  }

  async unsnooze(userId: string, threadId: string): Promise<void> {
    const { count } = await this.prisma.emailThread.updateMany({
      where: { id: threadId, account: { members: { some: { userId } } } },
      data: { snoozedUntil: null },
    });

    if (count === 0) {
      throw new NotFoundException('Thread not found');
    }

    await this.queueService.cancelSnoozeWake(threadId);
  }

  /** Stores a summary the user asked for, in the same fields the AI
   * pipeline overwrites whenever a new message lands on the thread. */
  async saveSummary(
    userId: string,
    threadId: string,
    summary: string,
    keyPoints: string[],
  ): Promise<void> {
    const { count } = await this.prisma.emailThread.updateMany({
      where: { id: threadId, account: { members: { some: { userId } } } },
      data: { summary, summaryKeyPoints: keyPoints },
    });

    if (count === 0) {
      throw new NotFoundException('Thread not found');
    }
  }

  /**
   * Shared Inbox (v2.0): claim/reassign/unassign a thread. Any member can
   * do this (not owner-only) — matches how shared mailboxes elsewhere
   * (Front, Help Scout) treat assignment as a team-workflow action, not a
   * privileged one. `assigneeUserId: null` unassigns.
   */
  async assignThread(
    userId: string,
    threadId: string,
    assigneeUserId: string | null | undefined,
  ): Promise<void> {
    const thread = await this.prisma.emailThread.findUnique({
      where: { id: threadId },
      select: { accountId: true },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    // Throws if the requester can't act on this thread's account at all.
    await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      thread.accountId,
    );

    if (assigneeUserId) {
      // The assignee must themselves have Shared Inbox access to this
      // account — assigning to someone who can't see the thread would be
      // a dead end.
      await this.emailAccountService.getAccessibleAccountOrThrow(
        assigneeUserId,
        thread.accountId,
      );
    }

    await this.prisma.emailThread.update({
      where: { id: threadId },
      data: { assignedToUserId: assigneeUserId ?? null },
    });
  }

  /** Shared Inbox (v2.0) internal note — any member can add one; never
   * sent externally, never included in AI prompt context (see
   * ThreadNote's schema comment). */
  async addNote(userId: string, threadId: string, body: string) {
    const thread = await this.prisma.emailThread.findUnique({
      where: { id: threadId },
      select: { accountId: true },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      thread.accountId,
    );

    return this.prisma.threadNote.create({
      data: { threadId, authorId: userId, body },
      include: {
        author: { select: { id: true, email: true, displayName: true } },
      },
    });
  }

  /** Any member can delete any note on an account they have access to —
   * matches Internal Notes being a shared team scratchpad, not a
   * per-author-only record. Revisit if that turns out to be the wrong
   * call once this sees real usage. */
  async deleteNote(
    userId: string,
    threadId: string,
    noteId: string,
  ): Promise<void> {
    const note = await this.prisma.threadNote.findUnique({
      where: { id: noteId },
      select: { threadId: true, thread: { select: { accountId: true } } },
    });

    if (!note || note.threadId !== threadId) {
      throw new NotFoundException('Note not found');
    }

    await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      note.thread.accountId,
    );

    await this.prisma.threadNote.delete({ where: { id: noteId } });
  }

  /**
   * The Waiting view (see docs/v1.2-plan.md): threads where the user sent
   * the most recent message and nothing has come back in `olderThanDays`
   * (0 lists everything still waiting) — not an AI capability, a rules
   * pass over data that's already there, reusing extracted meeting
   * requests as a secondary signal rather than a fresh LLM call per thread.
   *
   * "The user sent the last message" is EmailThread.lastMessageFromSelf,
   * kept in step with lastMessageAt by sync and compose. Filtering on it in
   * the query (instead of fetching the 50 OLDEST threads and filtering in
   * code, which missed every recent candidate once an account had more
   * than 50 threads) returns the most recent candidates first. A thread
   * the user said they aren't waiting on stays out until they send
   * another message on it.
   */
  async getFollowUpCandidates(userId: string, olderThanDays = 3) {
    const now = new Date();
    const threshold = new Date(now.getTime() - olderThanDays * DAY_MS);

    const threads = await this.prisma.emailThread.findMany({
      where: {
        account: { members: { some: { userId } }, deletedAt: null },
        lastMessageFromSelf: true,
        lastMessageAt: { lt: threshold },
        folder: { type: { not: 'DRAFTS' } },
        AND: [
          { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] },
          {
            OR: [
              { waitingDismissedAt: null },
              {
                waitingDismissedAt: {
                  lt: this.prisma.emailThread.fields.lastMessageAt,
                },
              },
            ],
          },
        ],
      },
      include: {
        account: {
          select: { id: true, provider: true, email: true, aliases: true },
        },
        tasks: {
          where: { type: 'MEETING_REQUEST', status: 'PENDING' },
          select: { id: true, description: true },
        },
        // The user's own last message — its recipients are who the
        // thread is waiting on.
        messages: {
          orderBy: { receivedAt: 'desc' },
          take: 1,
          select: { to: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 50,
    });

    return threads.map(({ account: { aliases, ...account }, ...thread }) => ({
      threadId: thread.id,
      subject: thread.subject,
      snippet: thread.snippet,
      summary: thread.summary,
      lastMessageAt: thread.lastMessageAt,
      daysSinceLastMessage: thread.lastMessageAt
        ? Math.floor((now.getTime() - thread.lastMessageAt.getTime()) / DAY_MS)
        : null,
      followUpAt: thread.followUpAt,
      waitingOn: recipientsOtherThan(thread.messages[0]?.to, [
        account.email,
        ...aliases,
      ]),
      account,
      relatedMeetingRequests: thread.tasks,
    }));
  }

  /** "Not waiting on this" (waiting=false) hides a thread from the
   * Waiting view and cancels its reminder until the user sends another
   * message on it; waiting=true undoes that. */
  async setWaiting(
    userId: string,
    threadId: string,
    waiting: boolean,
  ): Promise<void> {
    const { count } = await this.prisma.emailThread.updateMany({
      where: { id: threadId, account: { members: { some: { userId } } } },
      data: waiting
        ? { waitingDismissedAt: null }
        : { waitingDismissedAt: new Date(), followUpAt: null },
    });

    if (count === 0) {
      throw new NotFoundException('Thread not found');
    }
  }

  /** Sets (or, with null, cancels) the "remind me if nobody replies"
   * time on an existing thread — compose only sets it at send time. */
  async setFollowUpReminder(
    userId: string,
    threadId: string,
    days: number | null,
  ): Promise<void> {
    const { count } = await this.prisma.emailThread.updateMany({
      where: { id: threadId, account: { members: { some: { userId } } } },
      data: {
        followUpAt: days ? new Date(Date.now() + days * DAY_MS) : null,
      },
    });

    if (count === 0) {
      throw new NotFoundException('Thread not found');
    }
  }

  async getThread(userId: string, threadId: string) {
    const thread = await this.prisma.emailThread.findUnique({
      where: { id: threadId },
      include: {
        account: {
          select: { id: true, provider: true, email: true, userId: true },
        },
        folder: true,
        messages: {
          orderBy: { receivedAt: 'asc' },
          // AI replies held for review live as local drafts in a separate
          // Drafts thread; surfacing them on the message they answer is
          // what lets a reviewer see the draft next to the conversation.
          include: {
            attachments: {
              where: { isInline: false },
              select: { id: true, filename: true, mimeType: true, size: true },
            },
            draftReplies: {
              where: { thread: { folder: { type: 'DRAFTS' } } },
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                bodyText: true,
                createdAt: true,
                generationMetadata: true,
                scheduledSendAt: true,
                approvalChain: { select: { status: true } },
              },
            },
          },
        },
        assignedTo: {
          select: { id: true, email: true, displayName: true },
        },
        notes: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, email: true, displayName: true } },
          },
        },
      },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    // Throws NotFoundException/ForbiddenException itself — centralizing
    // the membership check in EmailAccountService instead of duplicating
    // an `account.members.some(...)` query per call site.
    await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      thread.account.id,
    );

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

    await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      message.thread.account.id,
    );

    return message;
  }

  /**
   * The "Retry AI" action for a message whose AI processing failed (or
   * never finished). Safe to call repeatedly: the pipeline's effect ledger
   * guarantees a retry never repeats a send, rule action or draft that an
   * earlier attempt already completed.
   */
  async retryAiProcessing(userId: string, messageId: string): Promise<void> {
    const message = await this.getMessageOwned(userId, messageId);

    if (message.aiProcessedAt) {
      throw new ConflictException(
        'This message has already been processed by the AI assistant',
      );
    }

    await this.prisma.emailMessage.update({
      where: { id: messageId },
      data: { aiFailedAt: null, aiError: null },
    });
    await this.queueService.enqueueAiProcessing(messageId, { retry: true });
  }

  /** An attachment's bytes, fetched from the provider (only metadata is
   * synced). Anyone with access to the account can download. */
  async getAttachmentContent(userId: string, attachmentId: string) {
    const attachment = await this.prisma.emailAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        message: {
          select: {
            providerMessageId: true,
            thread: {
              select: {
                accountId: true,
                folder: { select: { providerFolderId: true } },
              },
            },
          },
        },
      },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    const account = await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      attachment.message.thread.accountId,
    );
    const client = await this.mailProviderFactory.createClient(account);
    const content = await client.getAttachment(
      attachment.message.providerMessageId,
      attachment.providerAttachmentId,
      attachment.message.thread.folder.providerFolderId ?? undefined,
    );

    return {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      content,
    };
  }

  /** The account's synced folders — what a MOVE_TO_FOLDER rule can
   * target. Local-only folders (app-side Drafts/Sent) are left out. */
  async listFolders(userId: string, accountId: string) {
    await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      accountId,
    );

    return this.prisma.mailFolder.findMany({
      where: { accountId, providerFolderId: { not: null } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, type: true },
    });
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

/** A message's `to` list without the account's own addresses. */
function recipientsOtherThan(
  to: Prisma.JsonValue | undefined,
  ownAddresses: string[],
): { name?: string; address: string }[] {
  if (!Array.isArray(to)) {
    return [];
  }
  const own = new Set(ownAddresses.map((address) => address.toLowerCase()));
  return (to as { name?: string; address?: string }[]).filter(
    (recipient): recipient is { name?: string; address: string } =>
      typeof recipient?.address === 'string' &&
      !own.has(recipient.address.toLowerCase()),
  );
}
