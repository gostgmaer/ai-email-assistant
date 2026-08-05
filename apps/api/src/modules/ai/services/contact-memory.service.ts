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

  async searchSimilar(
    userId: string,
    queryEmbedding: number[],
    limit = 3,
  ): Promise<ContactMemoryMatch[]> {
    const vector = toVectorLiteral(queryEmbedding);

    const rows = await this.prisma.$queryRaw<ContactMemoryRow[]>`
      SELECT "id", "senderEmail", "senderName", "facts",
             (embedding <=> ${vector}::vector) AS distance
      FROM "ContactMemory"
      WHERE "userId" = ${userId} AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vector}::vector
      LIMIT ${limit}
    `;

    return rows;
  }
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
