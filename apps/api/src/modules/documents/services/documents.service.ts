import { createHash } from 'crypto';

import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  forwardRef,
} from '@nestjs/common';

import { AiClientService, ProcessedDocumentChunk } from '../../ai';
import { PrismaService } from '../../../database';
import { Prisma } from '../../../generated/prisma/client';

export interface DocumentSummary {
  id: string;
  filename: string;
  contentType: string;
  provider: string;
  model: string;
  title: string;
  category: string | null;
  tags: string[];
  status: string;
  sourceType: string;
  documentType: string;
  fileSize: number;
  version: number;
  parser: string | null;
  splitter: string | null;
  chunkSize: number | null;
  chunkOverlap: number | null;
  embeddingDimension: number;
  pageCount: number | null;
  totalChunks: number;
  totalTokens: number;
  createdAt: Date;
  indexedAt: Date | null;
  chunkCount: number;
  /** True when this file was already uploaded — the existing document was
   * returned as-is instead of being reprocessed. Only set by upload. */
  duplicate?: boolean;
}

/** Fields that stay null until a real enrichment/connector step exists —
 * broken out from DocumentSummary so the list view isn't cluttered with
 * always-empty columns. */
export interface DocumentDetail extends DocumentSummary {
  description: string | null;
  summary: string | null;
  author: string | null;
  owner: string | null;
  language: string | null;
  sourceName: string | null;
  sourcePath: string | null;
  sourceUrl: string | null;
  externalId: string | null;
  metadata: Record<string, unknown>;
  chunks: DocumentChunkView[];
}

interface DocumentChunkFields {
  id: string;
  chunkIndex: number;
  content: string;
  contentHash: string | null;
  metadata: Record<string, unknown>;
  section: string | null;
  page: number | null;
  chunkType: string;
  tokenCount: number | null;
  wordCount: number | null;
  characterCount: number | null;
  startChar: number | null;
  endChar: number | null;
  lineStart: number | null;
  lineEnd: number | null;
  parentChunkId: string | null;
  keywords: unknown[];
  entities: unknown[];
  importance: number | null;
  embeddingModel: string | null;
  embeddingDimension: number;
  embeddingVersion: number;
}

export type DocumentChunkView = DocumentChunkFields;

export interface DocumentChunkMatch extends DocumentChunkFields {
  documentId: string;
  filename: string;
  title: string;
  category: string | null;
  tags: string[];
  documentType: string;
  sourceType: string;
  distance: number;
}

/** Metadata filters applied alongside the vector search — the "Metadata
 * Filtering" step between vector search and re-ranking. */
export interface SearchFilters {
  category?: string;
  documentType?: string;
  sourceType?: string;
  chunkType?: string;
  tags?: string[];
}

interface DocumentRow {
  id: string;
  filename: string;
  contentType: string;
  provider: string;
  model: string;
  title: string;
  category: string | null;
  tags: string[];
  status: string;
  sourceType: string;
  documentType: string;
  fileSize: number;
  version: number;
  parser: string | null;
  splitter: string | null;
  chunkSize: number | null;
  chunkOverlap: number | null;
  embeddingDimension: number;
  pageCount: number | null;
  totalChunks: number;
  totalTokens: number;
  createdAt: Date;
  indexedAt: Date | null;
}

function toSummary(document: DocumentRow, chunkCount: number): DocumentSummary {
  return {
    id: document.id,
    filename: document.filename,
    contentType: document.contentType,
    provider: document.provider,
    model: document.model,
    title: document.title,
    category: document.category,
    tags: document.tags,
    status: document.status,
    sourceType: document.sourceType,
    documentType: document.documentType,
    fileSize: document.fileSize,
    version: document.version,
    parser: document.parser,
    splitter: document.splitter,
    chunkSize: document.chunkSize,
    chunkOverlap: document.chunkOverlap,
    embeddingDimension: document.embeddingDimension,
    pageCount: document.pageCount,
    totalChunks: document.totalChunks,
    totalTokens: document.totalTokens,
    createdAt: document.createdAt,
    indexedAt: document.indexedAt,
    chunkCount,
  };
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AiClientService))
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
        ...toSummary(existing, existing._count.chunks),
        duplicate: true,
      };
    }

    const result = await this.aiClientService.processDocument(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    // A document with no extractable text (scanned/image-only PDF, an empty
    // file) would otherwise hash to sha256("") below — every such upload by
    // the same user collides on that same empty hash and gets misreported as
    // a "duplicate" of the FIRST one, silently discarding its real content.
    // Reject instead of ever computing that hash.
    if (result.chunks.length === 0) {
      throw new UnprocessableEntityException(
        'No extractable text found in this document',
      );
    }

    // Second, content-based check: catches files whose bytes differ but
    // whose extracted text is identical (re-saved PDF, different line
    // endings), and pre-existing rows that predate the contentHash column
    // and so can never match on the fast path above.
    const chunkContentHash = createHash('sha256')
      .update(result.chunks.map((chunk) => chunk.content).join(''))
      .digest('hex');

    const existingByContent = await this.prisma.document.findUnique({
      where: { userId_chunkContentHash: { userId, chunkContentHash } },
      include: { _count: { select: { chunks: true } } },
    });

    if (existingByContent) {
      return {
        ...toSummary(existingByContent, existingByContent._count.chunks),
        duplicate: true,
      };
    }

    const fileExtension = extensionOf(file.originalname);
    const stats = aggregateStats(result.chunks);

    // Created at status PROCESSING first: the chunk-insert loop below is
    // not transactional, so a crash mid-loop leaves the row honestly
    // reflecting an incomplete index instead of silently claiming INDEXED.
    const document = await this.prisma.document.create({
      data: {
        userId,
        filename: file.originalname,
        contentType: file.mimetype,
        contentHash,
        chunkContentHash,
        provider: result.provider,
        model: result.model,
        title: file.originalname,
        sourceType: 'upload',
        documentType: fileExtension || file.mimetype,
        fileExtension,
        fileSize: file.size,
        status: 'PROCESSING',
        parser: result.parser,
        splitter: result.splitter,
        chunkSize: result.chunkSize,
        chunkOverlap: result.chunkOverlap,
        pageCount: result.pageCount,
        // result.chunks is guaranteed non-empty by the check above.
        embeddingDimension: result.chunks[0].embedding.length,
      },
    });

    for (const [index, chunk] of result.chunks.entries()) {
      const vector = toVectorLiteral(chunk.embedding);
      const chunkContentHashValue = createHash('sha256')
        .update(chunk.content)
        .digest('hex');

      await this.prisma.$executeRaw`
        INSERT INTO "DocumentChunk"
          ("id", "documentId", "chunkIndex", "content", "contentHash", "metadata",
           "section", "page", "chunkType", "tokenCount", "wordCount", "characterCount",
           "startChar", "endChar", "lineStart", "lineEnd",
           "embeddingModel", "embeddingDimension", "embeddingVersion",
           "embedding", "createdAt", "updatedAt")
        VALUES
          (gen_random_uuid(), ${document.id}, ${index}, ${chunk.content}, ${chunkContentHashValue},
           ${JSON.stringify(chunk.metadata)}::jsonb, ${chunk.section}, ${chunk.page},
           ${chunk.chunkType}, ${chunk.tokenCount}, ${chunk.wordCount}, ${chunk.characterCount},
           ${chunk.startChar}, ${chunk.endChar}, ${chunk.lineStart}, ${chunk.lineEnd},
           ${result.model}, ${chunk.embedding.length}, 1,
           ${vector}::vector, now(), now())
      `;
    }

    const indexedAt = new Date();
    const updated = await this.prisma.document.update({
      where: { id: document.id },
      data: {
        status: 'INDEXED',
        indexedAt,
        totalChunks: stats.totalChunks,
        totalTokens: stats.totalTokens,
        totalCharacters: stats.totalCharacters,
      },
    });

    return { ...toSummary(updated, stats.totalChunks), duplicate: false };
  }

  async listForUser(userId: string): Promise<DocumentSummary[]> {
    const documents = await this.prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { chunks: true } } },
    });

    return documents.map((document) =>
      toSummary(document, document._count.chunks),
    );
  }

  async getForUser(userId: string, id: string): Promise<DocumentDetail> {
    const document = await this.prisma.document.findFirst({
      where: { id, userId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const chunks = await this.prisma.$queryRaw<DocumentChunkView[]>`
      SELECT "id", "chunkIndex", "content", "contentHash", "metadata", "section", "page",
             "chunkType", "tokenCount", "wordCount", "characterCount",
             "startChar", "endChar", "lineStart", "lineEnd", "parentChunkId",
             "keywords", "entities", "importance",
             "embeddingModel", "embeddingDimension", "embeddingVersion"
      FROM "DocumentChunk"
      WHERE "documentId" = ${id}
      ORDER BY "chunkIndex" ASC
    `;

    // Best-effort retrieval touch — doesn't block the response on failure.
    void this.prisma.document
      .update({ where: { id }, data: { lastAccessedAt: new Date() } })
      .catch(() => undefined);

    return {
      ...toSummary(document, chunks.length),
      description: document.description,
      summary: document.summary,
      author: document.author,
      owner: document.owner,
      language: document.language,
      sourceName: document.sourceName,
      sourcePath: document.sourcePath,
      sourceUrl: document.sourceUrl,
      externalId: document.externalId,
      metadata: document.metadata as Record<string, unknown>,
      chunks,
    };
  }

  async remove(userId: string, id: string): Promise<void> {
    // deleteMany scoped by userId avoids a check-then-delete race and never
    // throws for another user's document — it just deletes zero rows.
    // DocumentChunk rows cascade via the FK's onDelete: Cascade.
    const { count } = await this.prisma.document.deleteMany({
      where: { id, userId },
    });

    if (count === 0) {
      throw new NotFoundException('Document not found');
    }
  }

  // Joins through Document to scope by userId — DocumentChunk has no
  // userId column of its own, so this join is the entire isolation
  // boundary for cross-user chunk search. Never query DocumentChunk by
  // embedding similarity without it.
  async search(
    userId: string,
    query: string,
    limit = 5,
    filters?: SearchFilters,
    maxDistance = DEFAULT_MAX_DISTANCE,
  ): Promise<DocumentChunkMatch[]> {
    const { embedding } = await this.aiClientService.embedQuery(query);
    const vector = toVectorLiteral(embedding);

    // Only INDEXED documents: PROCESSING means the row exists but chunks
    // may still be mid-insert; FAILED shouldn't happen (see create() above)
    // but is excluded defensively.
    //
    // The cosine-distance cap keeps LIMIT from always returning `limit`
    // chunks even when the corpus has nothing relevant to the query — those
    // chunks would otherwise flow straight into ai-processing.processor.ts's
    // reply-generation prompt as "relevant context". The full `<=>`
    // expression is repeated rather than referencing the `distance` SELECT
    // alias because Postgres evaluates WHERE before SELECT aliases exist.
    const conditions: Prisma.Sql[] = [
      Prisma.sql`d."userId" = ${userId}`,
      Prisma.sql`dc."embedding" IS NOT NULL`,
      Prisma.sql`d."status" = 'INDEXED'`,
      Prisma.sql`(dc.embedding <=> ${vector}::vector) <= ${maxDistance}`,
    ];

    // "Metadata Filtering" pass alongside the vector search, not after it —
    // narrowing by document/chunk identity before ranking is cheaper and
    // more precise than filtering a fixed top-N vector result afterwards.
    if (filters?.category) {
      conditions.push(Prisma.sql`d."category" = ${filters.category}`);
    }
    if (filters?.documentType) {
      conditions.push(Prisma.sql`d."documentType" = ${filters.documentType}`);
    }
    if (filters?.sourceType) {
      conditions.push(Prisma.sql`d."sourceType" = ${filters.sourceType}`);
    }
    if (filters?.chunkType) {
      conditions.push(Prisma.sql`dc."chunkType" = ${filters.chunkType}`);
    }
    if (filters?.tags && filters.tags.length > 0) {
      conditions.push(Prisma.sql`d."tags" && ${filters.tags}::text[]`);
    }

    const matches = await this.prisma.$queryRaw<DocumentChunkMatch[]>(
      Prisma.sql`
        SELECT dc."id", dc."chunkIndex", dc."content", dc."contentHash", dc."metadata",
               dc."section", dc."page", dc."chunkType", dc."tokenCount", dc."wordCount",
               dc."characterCount", dc."startChar", dc."endChar", dc."lineStart", dc."lineEnd",
               dc."parentChunkId", dc."keywords", dc."entities", dc."importance",
               dc."embeddingModel", dc."embeddingDimension", dc."embeddingVersion",
               d."id" AS "documentId", d."filename", d."title", d."category", d."tags",
               d."documentType", d."sourceType",
               (dc.embedding <=> ${vector}::vector) AS distance
        FROM "DocumentChunk" dc
        JOIN "Document" d ON d."id" = dc."documentId"
        WHERE ${Prisma.join(conditions, ' AND ')}
        ORDER BY dc.embedding <=> ${vector}::vector
        LIMIT ${limit}
      `,
    );

    const documentIds = [...new Set(matches.map((match) => match.documentId))];
    if (documentIds.length > 0) {
      void this.prisma.document
        .updateMany({
          where: { id: { in: documentIds } },
          data: { lastAccessedAt: new Date() },
        })
        .catch(() => undefined);
    }

    return matches;
  }
}

// pgvector's `<=>` is cosine distance (0 = identical, 2 = opposite). 0.8 is
// deliberately permissive — cutting only chunks that are essentially
// unrelated to the query — since there's no tuned/tested threshold for this
// corpus yet; callers needing tighter precision can pass a lower value.
const DEFAULT_MAX_DISTANCE = 0.8;

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

function extensionOf(filename: string): string {
  return filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
}

function aggregateStats(chunks: ProcessedDocumentChunk[]): {
  totalChunks: number;
  totalTokens: number;
  totalCharacters: number;
} {
  return {
    totalChunks: chunks.length,
    totalTokens: chunks.reduce(
      (sum, chunk) => sum + (chunk.tokenCount || 0),
      0,
    ),
    totalCharacters: chunks.reduce(
      (sum, chunk) => sum + (chunk.characterCount || 0),
      0,
    ),
  };
}
