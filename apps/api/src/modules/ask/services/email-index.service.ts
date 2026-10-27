import { randomUUID } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../database';
import { Prisma } from '../../../generated/prisma/client';
import { AiClientService } from '../../ai/services/ai-client.service';
import { buildEmailChunks } from '../utils/email-chunks.util';

const DAY_MS = 24 * 60 * 60 * 1000;

// The AI service's /documents/embed-batch limit (MAX_EMBED_BATCH).
const EMBED_BATCH_LIMIT = 100;

// Folders whose mail is never indexed. A message moved into one of these
// after it was indexed is filtered out at search time instead.
const UNINDEXED_FOLDERS = ['DRAFTS', 'SPAM', 'TRASH'] as const;

export interface IndexProgress {
  indexed: number;
  total: number;
}

/**
 * Builds the "Ask your inbox" index: EmailChunk rows with embeddings, for
 * every message in the last ASK_INDEX_DAYS that isn't spam, trash or a
 * draft. Driven by the repeatable search-index job, which calls
 * indexPending() until it returns 0 — so the first backfill, newly synced
 * mail and the user's own sent mail all go through the same path.
 */
@Injectable()
export class EmailIndexService {
  private readonly logger = new Logger(EmailIndexService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClientService: AiClientService,
    private readonly configService: ConfigService,
  ) {}

  /** Indexes up to SEARCH_INDEX_BATCH_SIZE unindexed messages, newest
   * first. Returns how many messages it handled (0 means caught up). */
  async indexPending(): Promise<number> {
    const batchSize = Number(
      this.configService.get<string>('SEARCH_INDEX_BATCH_SIZE') ?? 50,
    );

    const messages = await this.prisma.emailMessage.findMany({
      where: { searchIndexedAt: null, ...this.indexableWhere() },
      orderBy: { receivedAt: 'desc' },
      take: batchSize,
      select: {
        id: true,
        subject: true,
        from: true,
        to: true,
        receivedAt: true,
        bodyText: true,
        bodyHtml: true,
        thread: { select: { accountId: true } },
      },
    });

    if (messages.length === 0) {
      return 0;
    }

    const chunks = messages.flatMap((message) =>
      buildEmailChunks(message).map((content, chunkIndex) => ({
        messageId: message.id,
        accountId: message.thread.accountId,
        chunkIndex,
        content,
      })),
    );

    const embeddings: number[][] = [];
    let model = '';
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_LIMIT) {
      const batch = chunks.slice(i, i + EMBED_BATCH_LIMIT);
      const response = await this.aiClientService.embedBatch(
        batch.map((chunk) => chunk.content),
      );
      if (response.embeddings.length !== batch.length) {
        throw new Error(
          `AI service returned ${response.embeddings.length} embeddings for ${batch.length} texts`,
        );
      }
      embeddings.push(...response.embeddings);
      model = response.model;
    }

    const messageIds = messages.map((message) => message.id);

    // One transaction: a message is marked indexed only together with its
    // chunks. Existing chunks are replaced (a retry after a partial failure
    // starts clean), and ON CONFLICT covers two scans racing on the same
    // message — the API and worker processes both run this processor.
    await this.prisma.$transaction(async (tx) => {
      await tx.emailChunk.deleteMany({
        where: { messageId: { in: messageIds } },
      });

      if (chunks.length > 0) {
        const rows = chunks.map(
          (chunk, i) => Prisma.sql`(
            ${randomUUID()}, ${chunk.messageId}, ${chunk.accountId},
            ${chunk.chunkIndex}, ${chunk.content},
            ${toVectorLiteral(embeddings[i])}::vector, ${model}, now()
          )`,
        );
        await tx.$executeRaw`
          INSERT INTO "EmailChunk"
            ("id", "messageId", "accountId", "chunkIndex", "content",
             "embedding", "embeddingModel", "createdAt")
          VALUES ${Prisma.join(rows)}
          ON CONFLICT ("messageId", "chunkIndex") DO NOTHING
        `;
      }

      await tx.emailMessage.updateMany({
        where: { id: { in: messageIds } },
        data: { searchIndexedAt: new Date() },
      });
    });

    this.logger.log(
      `Indexed ${messages.length} message(s) as ${chunks.length} chunk(s) for search.`,
    );
    return messages.length;
  }

  /** How much of the user's indexable mail is searchable yet — shown on
   * the Ask page until the first backfill finishes. */
  async getProgress(userId: string): Promise<IndexProgress> {
    const where: Prisma.EmailMessageWhereInput = {
      ...this.indexableWhere(),
      thread: {
        ...this.indexableWhere().thread,
        account: { deletedAt: null, members: { some: { userId } } },
      },
    };

    const [indexed, total] = await this.prisma.$transaction([
      this.prisma.emailMessage.count({
        where: { ...where, searchIndexedAt: { not: null } },
      }),
      this.prisma.emailMessage.count({ where }),
    ]);

    return { indexed, total };
  }

  private indexableWhere() {
    const since = new Date(
      Date.now() -
        Number(this.configService.get<string>('ASK_INDEX_DAYS') ?? 365) *
          DAY_MS,
    );

    return {
      receivedAt: { gte: since },
      isSpam: false,
      thread: {
        folder: { type: { notIn: [...UNINDEXED_FOLDERS] } },
        account: { deletedAt: null },
      },
    } satisfies Prisma.EmailMessageWhereInput;
  }
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
