import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../database';

export interface ContactFacts {
  role?: string | null;
  company?: string | null;
  summary: string;
  commitments: string[];
}

export interface ContactMemoryMatch {
  id: string;
  senderEmail: string;
  senderName: string | null;
  facts: ContactFacts;
  distance: number;
}

interface ContactMemoryRow {
  id: string;
  senderEmail: string;
  senderName: string | null;
  facts: ContactFacts;
  distance: number;
}

/**
 * Every method here takes userId as a required, non-optional parameter and
 * includes it in the SQL WHERE/ON CONFLICT clause. That is the entire
 * isolation boundary for this table — never add a method that queries or
 * writes ContactMemory without it.
 */
@Injectable()
export class ContactMemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertMemory(
    userId: string,
    senderEmail: string,
    senderName: string | null | undefined,
    facts: ContactFacts,
    embedding: number[],
  ): Promise<void> {
    const vector = toVectorLiteral(embedding);

    await this.prisma.$executeRaw`
      INSERT INTO "ContactMemory" ("id", "userId", "senderEmail", "senderName", "facts", "embedding", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${userId}, ${senderEmail}, ${senderName ?? null}, ${JSON.stringify(facts)}::jsonb, ${vector}::vector, now(), now())
      ON CONFLICT ("userId", "senderEmail")
      DO UPDATE SET
        "senderName" = COALESCE(EXCLUDED."senderName", "ContactMemory"."senderName"),
        "facts" = EXCLUDED."facts",
        "embedding" = EXCLUDED."embedding",
        "updatedAt" = now()
    `;
  }

  /**
   * excludeSenderEmail must be the current contact's own address — without
   * it, that contact's own just-upserted row (distance ≈ 0, since callers
   * always upsertMemory() right before calling this) reliably wins the top
   * slot, silently displacing genuinely-other-contact matches. maxDistance
   * (pgvector cosine distance, 0 = identical, 2 = opposite) guards against
   * the remaining case: with no threshold at all, this previously always
   * returned up to `limit` OTHER contacts regardless of relevance, and their
   * facts got labeled "known context about people involved in this
   * conversation" in the reply prompt — a real hallucination vector where an
   * unrelated contact's facts (e.g. a different job application) bled into
   * a reply about something else entirely. 0.5 keeps this reasonably tight;
   * see documents.service.ts's DEFAULT_MAX_DISTANCE for the same rationale
   * applied to document RAG.
   */
  async searchSimilar(
    userId: string,
    queryEmbedding: number[],
    excludeSenderEmail: string,
    limit = 3,
    maxDistance = 0.5,
  ): Promise<ContactMemoryMatch[]> {
    const vector = toVectorLiteral(queryEmbedding);

    const rows = await this.prisma.$queryRaw<ContactMemoryRow[]>`
      SELECT "id", "senderEmail", "senderName", "facts",
             (embedding <=> ${vector}::vector) AS distance
      FROM "ContactMemory"
      WHERE "userId" = ${userId}
        AND "senderEmail" != ${excludeSenderEmail}
        AND embedding IS NOT NULL
        AND (embedding <=> ${vector}::vector) <= ${maxDistance}
      ORDER BY embedding <=> ${vector}::vector
      LIMIT ${limit}
    `;

    return rows;
  }
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
