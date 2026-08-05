import { createHash } from 'crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import { AiClientService } from '../../ai';
import { PrismaService } from '../../../database';

export interface DocumentSummary {
  id: string;
  filename: string;
  contentType: string;
  provider: string;
  model: string;
  createdAt: Date;
  chunkCount: number;
  /** True when this file was already uploaded — the existing document was
   * returned as-is instead of being reprocessed. Only set by upload. */
  duplicate?: boolean;
}

export interface DocumentChunkView {
  id: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
}

export interface DocumentDetail extends DocumentSummary {
  chunks: DocumentChunkView[];
}

export interface DocumentChunkMatch {
  id: string;
  documentId: string;
  filename: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
  distance: number;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClientService: AiClientService,
  ) {}

  async processAndStore(
    userId: string,
    file: Express.Multer.File,
  ): Promise<DocumentSummary> {
    const contentHash = createHash('sha256').update(file.buffer).digest('hex');

    const existing = await this.prisma.document.findUnique({
      where: { userId_contentHash: { userId, contentHash } },
      include: { _count: { select: { chunks: true } } },
    });

    if (existing) {
      return {
        id: existing.id,
        filename: existing.filename,
        contentType: existing.contentType,
        provider: existing.provider,
        model: existing.model,
        createdAt: existing.createdAt,
        chunkCount: existing._count.chunks,
        duplicate: true,
      };
    }

    const result = await this.aiClientService.processDocument(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    const document = await this.prisma.document.create({
      data: {
        userId,
        filename: file.originalname,
        contentType: file.mimetype,
        contentHash,
        provider: result.provider,
        model: result.model,
      },
    });

    for (const [index, chunk] of result.chunks.entries()) {
      const vector = toVectorLiteral(chunk.embedding);
      await this.prisma.$executeRaw`
        INSERT INTO "DocumentChunk" ("id", "documentId", "chunkIndex", "content", "metadata", "embedding", "createdAt")
        VALUES (gen_random_uuid(), ${document.id}, ${index}, ${chunk.content}, ${JSON.stringify(chunk.metadata)}::jsonb, ${vector}::vector, now())
      `;
    }

    return {
      id: document.id,
      filename: document.filename,
      contentType: document.contentType,
      provider: document.provider,
      model: document.model,
      createdAt: document.createdAt,
      chunkCount: result.chunks.length,
      duplicate: false,
    };
  }

  async listForUser(userId: string): Promise<DocumentSummary[]> {
    const documents = await this.prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { chunks: true } } },
    });

    return documents.map((document) => ({
      id: document.id,
      filename: document.filename,
      contentType: document.contentType,
      provider: document.provider,
      model: document.model,
      createdAt: document.createdAt,
      chunkCount: document._count.chunks,
    }));
  }

  async getForUser(userId: string, id: string): Promise<DocumentDetail> {
    const document = await this.prisma.document.findFirst({
      where: { id, userId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const chunks = await this.prisma.$queryRaw<DocumentChunkView[]>`
      SELECT "id", "chunkIndex", "content", "metadata" FROM "DocumentChunk"
      WHERE "documentId" = ${id}
      ORDER BY "chunkIndex" ASC
    `;

    return {
      id: document.id,
      filename: document.filename,
      contentType: document.contentType,
      provider: document.provider,
      model: document.model,
      createdAt: document.createdAt,
      chunkCount: chunks.length,
      chunks,
    };
  }

  // Joins through Document to scope by userId — DocumentChunk has no
  // userId column of its own, so this join is the entire isolation
  // boundary for cross-user chunk search. Never query DocumentChunk by
  // embedding similarity without it.
  async search(
    userId: string,
    query: string,
    limit = 5,
  ): Promise<DocumentChunkMatch[]> {
    const { embedding } = await this.aiClientService.embedQuery(query);
    const vector = toVectorLiteral(embedding);

    return this.prisma.$queryRaw<DocumentChunkMatch[]>`
      SELECT dc."id", dc."chunkIndex", dc."content", dc."metadata",
             d."id" AS "documentId", d."filename",
             (dc.embedding <=> ${vector}::vector) AS distance
      FROM "DocumentChunk" dc
      JOIN "Document" d ON d."id" = dc."documentId"
      WHERE d."userId" = ${userId} AND dc.embedding IS NOT NULL
      ORDER BY dc.embedding <=> ${vector}::vector
      LIMIT ${limit}
    `;
  }
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
