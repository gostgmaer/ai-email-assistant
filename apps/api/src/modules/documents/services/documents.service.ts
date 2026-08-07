import { createHash } from 'crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';

import {
  AiClientService,
  ProcessDocumentResponse,
  ProcessedDocumentChunk,
} from '../../ai';
import { PrismaService } from '../../../database';
import { Prisma } from '../../../generated/prisma/client';
import { QueueService } from '../../../infrastructure/queue';
import { FileStorageService } from './file-storage.service';

/** File-upload-service's own RBAC concept — this app has no roles, so
 * every upload/download is attributed the same generic role. */
export const FILE_SERVICE_USER_ROLE = 'member';

export const ALLOWED_DOCUMENT_EXTENSIONS = [
  'pdf',
  'docx',
  'txt',
  'md',
  'html',
  'htm',
  'csv',
  'xlsx',
  'json',
  'xml',
  'eml',
  'msg',
] as const;

export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/** Browsers/OSes are inconsistent about the Content-Type they attach to a
 * multipart upload — .msg and .md in particular are routinely reported as
 * application/octet-stream, and file-upload-service's own MIME allowlist
 * rejects that generic type. Since the extension is already validated
 * against ALLOWED_DOCUMENT_EXTENSIONS above, derive the canonical MIME
 * type from it rather than trusting whatever the client sent. */
const CANONICAL_MIME_TYPES: Record<
  (typeof ALLOWED_DOCUMENT_EXTENSIONS)[number],
  string
> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
  htm: 'text/html',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  json: 'application/json',
  xml: 'application/xml',
  eml: 'message/rfc822',
  msg: 'application/vnd.ms-outlook',
};

export interface DocumentSummary {
  id: string;
  filename: string;
  contentType: string;
  provider: string | null;
  model: string | null;
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
  provider: string | null;
  model: string | null;
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
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorageService: FileStorageService,
    private readonly queueService: QueueService,
    @Inject(forwardRef(() => AiClientService))
    private readonly aiClientService: AiClientService,
  ) {}

  /**
   * The upload layer's entire job: validate, checksum, upload the raw
   * bytes to file-upload-service, store metadata, enqueue a processing
   * job, return immediately. This method never parses, reads, chunks, or
   * embeds the document — that's exclusively the AI service's job, done
   * later by DocumentsProcessingProcessor.
   */
  async upload(
    userId: string,
    userEmail: string,
    file: Express.Multer.File,
  ): Promise<DocumentSummary> {
    const fileExtension = extensionOf(file.originalname);
    if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(fileExtension as never)) {
      throw new BadRequestException(
        `Unsupported file extension ".${fileExtension}". Allowed: ${ALLOWED_DOCUMENT_EXTENSIONS.join(', ')}`,
      );
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      throw new BadRequestException(
        `File is too large (${file.size} bytes). Maximum is ${MAX_DOCUMENT_SIZE_BYTES} bytes.`,
      );
    }

    const contentType =
      CANONICAL_MIME_TYPES[fileExtension as (typeof ALLOWED_DOCUMENT_EXTENSIONS)[number]] ??
      file.mimetype;

    const contentHash = createHash('sha256').update(file.buffer).digest('hex');

    // Only dedup check that's still possible pre-processing: byte-identical
    // re-uploads. The old second pass (dedup by extracted-content hash)
    // required the AI service to have already run, which — now that
    // upload and processing are decoupled — would mean discovering the
    // duplicate only *after* paying for the AI call, too late to skip it.
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

    const uploaded = await this.fileStorageService.upload(
      file.buffer,
      file.originalname,
      contentType,
      { userId, userEmail, userRole: FILE_SERVICE_USER_ROLE },
    );

    const document = await this.prisma.document.create({
      data: {
        userId,
        filename: file.originalname,
        contentType,
        contentHash,
        externalId: uploaded.fileId,
        title: file.originalname,
        sourceType: 'upload',
        documentType: fileExtension || file.mimetype,
        fileExtension,
        fileSize: file.size,
        status: 'PROCESSING',
      },
    });

    const tenantId = this.fileStorageService.tenantId;

    await this.queueService.enqueueDocumentProcessing({
      documentId: document.id,
      tenantId,
      uploadedBy: userId,
      userEmail,
      userRole: FILE_SERVICE_USER_ROLE,
      fileId: uploaded.fileId,
      originalFileName: file.originalname,
      extension: fileExtension,
      mimeType: contentType,
      fileSize: file.size,
      checksum: contentHash,
      uploadTimestamp: document.createdAt.toISOString(),
    });

    return { ...toSummary(document, 0), duplicate: false };
  }

  /** Called by DocumentsProcessingProcessor once the AI service returns
   * chunks. Not transactional across the insert loop — a crash partway
   * leaves the row at PROCESSING, which markStaleAsFailed() will
   * eventually catch, rather than silently claiming INDEXED. */
  async completeProcessing(
    documentId: string,
    result: ProcessDocumentResponse,
  ): Promise<void> {
    if (result.chunks.length === 0) {
      // A document with no extractable text (scanned/image-only PDF, an
      // empty file) has nothing useful to index.
      await this.failProcessing(documentId, 'No extractable text found');
      return;
    }

    const stats = aggregateStats(result.chunks);
    // Informational only now (see the dedup comment in upload()) — no
    // longer used to redirect/short-circuit, just recorded for later
    // analysis (e.g. a script to find likely-duplicate content).
    const chunkContentHash = createHash('sha256')
      .update(result.chunks.map((chunk) => chunk.content).join(''))
      .digest('hex');

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
          (gen_random_uuid(), ${documentId}, ${index}, ${chunk.content}, ${chunkContentHashValue},
           ${JSON.stringify(chunk.metadata)}::jsonb, ${chunk.section}, ${chunk.page},
           ${chunk.chunkType}, ${chunk.tokenCount}, ${chunk.wordCount}, ${chunk.characterCount},
           ${chunk.startChar}, ${chunk.endChar}, ${chunk.lineStart}, ${chunk.lineEnd},
           ${result.model}, ${chunk.embedding.length}, 1,
           ${vector}::vector, now(), now())
      `;
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'INDEXED',
        indexedAt: new Date(),
        provider: result.provider,
        model: result.model,
        parser: result.parser,
        splitter: result.splitter,
        chunkSize: result.chunkSize,
        chunkOverlap: result.chunkOverlap,
        pageCount: result.pageCount,
        embeddingDimension: result.chunks[0].embedding.length,
        totalChunks: stats.totalChunks,
        totalTokens: stats.totalTokens,
        totalCharacters: stats.totalCharacters,
        chunkContentHash,
      },
    });
  }

  async failProcessing(documentId: string, reason: string): Promise<void> {
    this.logger.warn(`Document ${documentId} failed processing: ${reason}`);
    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'FAILED' },
    });
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

  // Called on a recurring schedule (see infrastructure/queue + the
  // DocumentsCleanupProcessor). A document stuck at PROCESSING means the
  // chunk-insert loop in processAndStore() never reached its final
  // status update — a crash, an OOM kill, a pod restart mid-upload. There's
  // no raw file stored to resume from, so the only real fix is telling the
  // user honestly instead of leaving it silently stuck forever.
  async markStaleAsFailed(): Promise<number> {
    const staleBefore = new Date(Date.now() - STALE_PROCESSING_TIMEOUT_MS);

    const { count } = await this.prisma.document.updateMany({
      where: { status: 'PROCESSING', createdAt: { lt: staleBefore } },
      data: { status: 'FAILED' },
    });

    return count;
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

// Uploads normally finish in low single-digit seconds (embedding calls,
// then a handful of raw inserts). 15 minutes is generous headroom for a
// slow AI service rather than a tuned value — the goal is catching crashed
// uploads, not flagging ones that are merely slow.
const STALE_PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;

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
