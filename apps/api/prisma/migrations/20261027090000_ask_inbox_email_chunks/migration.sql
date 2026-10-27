-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "searchIndexedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EmailChunk" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(768),
    "embeddingModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailMessage_searchIndexedAt_receivedAt_idx" ON "EmailMessage"("searchIndexedAt", "receivedAt");

-- CreateIndex
CREATE INDEX "EmailChunk_accountId_idx" ON "EmailChunk"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailChunk_messageId_chunkIndex_key" ON "EmailChunk"("messageId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "EmailChunk" ADD CONSTRAINT "EmailChunk_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written, not generated (Prisma can't declare either index; see the
-- EmailChunk model comment). HNSW with vector_cosine_ops matches the `<=>`
-- (cosine distance) ordering EmailSearchService uses, like
-- "DocumentChunk_embedding_hnsw_idx".
CREATE INDEX "EmailChunk_embedding_hnsw_idx" ON "EmailChunk"
  USING hnsw (embedding vector_cosine_ops);

-- Keyword half of the hybrid search. The 'simple' configuration (no
-- stemming, no stop words) because mail arrives in many languages —
-- English stemming would mangle Hindi and others, and exact names, numbers
-- and codes are what keyword search is for anyway.
CREATE INDEX "EmailChunk_content_fts_idx" ON "EmailChunk"
  USING GIN (to_tsvector('simple', "content"));
