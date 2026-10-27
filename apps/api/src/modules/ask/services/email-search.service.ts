import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../database';
import { Prisma } from '../../../generated/prisma/client';
import { AiClientService } from '../../ai/services/ai-client.service';
import { fuseRankings, keywordQuery } from '../utils/hybrid-search.util';

// Cosine distance above which a chunk isn't treated as a meaning match.
// Measured on real mail with gemini-embedding-001: chunks that answer a
// question sit around 0.29-0.32, while an unrelated question ("capital of
// Mongolia in 1850") gets nothing closer than ~0.50.
const MAX_VECTOR_DISTANCE = 0.45;

// How many candidates each half of the hybrid search contributes before
// fusion, and how many results come out the other end.
const CANDIDATES_PER_METHOD = 20;
const DEFAULT_RESULT_LIMIT = 8;

// At most this many chunks from one thread, so a long back-and-forth
// can't crowd every other email out of the answer's sources.
const MAX_CHUNKS_PER_THREAD = 2;

export interface EmailSearchFilters {
  accountId?: string;
  after?: Date;
  before?: Date;
}

export interface EmailSearchHit {
  chunkId: string;
  messageId: string;
  threadId: string;
  subject: string | null;
  from: unknown;
  receivedAt: Date;
  content: string;
  score: number;
}

interface ChunkRow {
  chunkId: string;
  messageId: string;
  threadId: string;
  subject: string | null;
  from: unknown;
  receivedAt: Date;
  content: string;
}

/**
 * Hybrid search over the "Ask your inbox" index: by meaning (pgvector,
 * good for paraphrases — "when do I fly" finds "your flight departs") and
 * by keyword (Postgres full-text, good for names, numbers and codes that
 * embeddings blur), merged with reciprocal-rank fusion.
 *
 * Scoped to accounts the user is a member of, and to mail that's still
 * searchable now — a message moved to spam or trash after it was indexed
 * drops out here.
 */
@Injectable()
export class EmailSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClientService: AiClientService,
  ) {}

  async search(
    userId: string,
    query: string,
    filters: EmailSearchFilters = {},
    limit = DEFAULT_RESULT_LIMIT,
  ): Promise<EmailSearchHit[]> {
    const accounts = await this.prisma.emailAccount.findMany({
      where: {
        id: filters.accountId,
        deletedAt: null,
        members: { some: { userId } },
      },
      select: { id: true },
    });
    if (accounts.length === 0) {
      return [];
    }
    const scope = this.scopeConditions(
      accounts.map((account) => account.id),
      filters,
    );

    const [vectorRows, keywordRows] = await Promise.all([
      this.vectorSearch(query, scope),
      this.keywordSearch(query, scope),
    ]);

    const rowsById = new Map<string, ChunkRow>();
    for (const row of [...vectorRows, ...keywordRows]) {
      rowsById.set(row.chunkId, row);
    }

    const fused = fuseRankings([
      vectorRows.map((row) => row.chunkId),
      keywordRows.map((row) => row.chunkId),
    ]);

    const perThread = new Map<string, number>();
    const hits: EmailSearchHit[] = [];
    for (const { id, score } of fused) {
      const row = rowsById.get(id);
      const count = perThread.get(row.threadId) ?? 0;
      if (count >= MAX_CHUNKS_PER_THREAD) {
        continue;
      }
      perThread.set(row.threadId, count + 1);
      hits.push({ ...row, score });
      if (hits.length >= limit) {
        break;
      }
    }
    return hits;
  }

  private async vectorSearch(
    query: string,
    scope: Prisma.Sql,
  ): Promise<ChunkRow[]> {
    const { embedding } = await this.aiClientService.embedQuery(query);
    const vector = `[${embedding.join(',')}]`;

    return this.prisma.$queryRaw<ChunkRow[]>`
      SELECT ${CHUNK_COLUMNS}
      FROM "EmailChunk" ec
      ${CHUNK_JOINS}
      WHERE ${scope}
        AND ec."embedding" IS NOT NULL
        AND (ec."embedding" <=> ${vector}::vector) <= ${MAX_VECTOR_DISTANCE}
      ORDER BY ec."embedding" <=> ${vector}::vector
      LIMIT ${CANDIDATES_PER_METHOD}
    `;
  }

  private async keywordSearch(
    query: string,
    scope: Prisma.Sql,
  ): Promise<ChunkRow[]> {
    const tsQuery = keywordQuery(query);
    if (!tsQuery) {
      return [];
    }

    // Same expression as the "EmailChunk_content_fts_idx" GIN index, so
    // Postgres can use it.
    return this.prisma.$queryRaw<ChunkRow[]>`
      SELECT ${CHUNK_COLUMNS}
      FROM "EmailChunk" ec
      ${CHUNK_JOINS}
      WHERE ${scope}
        AND to_tsvector('simple', ec."content") @@ to_tsquery('simple', ${tsQuery})
      ORDER BY ts_rank(to_tsvector('simple', ec."content"), to_tsquery('simple', ${tsQuery})) DESC
      LIMIT ${CANDIDATES_PER_METHOD}
    `;
  }

  private scopeConditions(
    accountIds: string[],
    filters: EmailSearchFilters,
  ): Prisma.Sql {
    const conditions = [
      Prisma.sql`ec."accountId" = ANY(${accountIds}::text[])`,
      Prisma.sql`m."isSpam" = false`,
      Prisma.sql`f."type" NOT IN ('DRAFTS', 'SPAM', 'TRASH')`,
    ];
    if (filters.after) {
      conditions.push(Prisma.sql`m."receivedAt" >= ${filters.after}`);
    }
    if (filters.before) {
      conditions.push(Prisma.sql`m."receivedAt" <= ${filters.before}`);
    }
    return Prisma.join(conditions, ' AND ');
  }
}

const CHUNK_COLUMNS = Prisma.sql`
  ec."id" AS "chunkId", ec."messageId", ec."content",
  m."threadId", m."subject", m."from", m."receivedAt"
`;

const CHUNK_JOINS = Prisma.sql`
  JOIN "EmailMessage" m ON m."id" = ec."messageId"
  JOIN "EmailThread" t ON t."id" = m."threadId"
  JOIN "MailFolder" f ON f."id" = t."folderId"
`;
