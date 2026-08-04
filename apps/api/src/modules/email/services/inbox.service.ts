import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../database';
import { ListThreadsDto } from '../dto';
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

    const where = {
      folder: {
        type: query.folderType ?? 'INBOX',
        accountId: query.accountId,
        account: { userId, deletedAt: null },
      },
      ...(query.q
        ? {
            OR: [
              { subject: { contains: query.q, mode: 'insensitive' as const } },
              { snippet: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
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

  async getThread(userId: string, threadId: string) {
    const thread = await this.prisma.emailThread.findUnique({
      where: { id: threadId },
      include: {
        folder: {
          include: {
            account: {
              select: { id: true, provider: true, email: true, userId: true },
            },
          },
        },
        messages: { orderBy: { receivedAt: 'asc' } },
      },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    if (thread.folder.account.userId !== userId) {
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
            folder: {
              include: {
                account: { select: { id: true, provider: true, userId: true } },
              },
            },
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.thread.folder.account.userId !== userId) {
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

    const account = message.thread.folder.account;
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
