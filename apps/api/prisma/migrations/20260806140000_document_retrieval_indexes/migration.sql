-- CreateIndex
CREATE INDEX "Document_documentType_idx" ON "Document"("documentType");

-- CreateIndex
CREATE INDEX "Document_tags_idx" ON "Document" USING GIN ("tags");

-- HNSW index for approximate nearest-neighbor search on chunk embeddings.
-- Prisma can't declare this itself — "embedding" is an Unsupported("vector(768)")
-- column, so this is hand-written raw SQL rather than generated from the schema.
-- vector_cosine_ops matches the `<=>` (cosine distance) operator used by
-- DocumentsService.search()'s ORDER BY. Without this index, every search does
-- a full sequential scan + sort over all of a user's chunks.
--
-- Note: on a large existing table, building this as a single blocking
-- CREATE INDEX (as opposed to CREATE INDEX CONCURRENTLY) locks out writes to
-- DocumentChunk for the duration of the build. Fine here since Prisma
-- migrations run inside a transaction anyway (CONCURRENTLY cannot run in a
-- transaction) and the table is small; on a large production table, apply the
-- CONCURRENTLY variant as a manual out-of-band step instead.
CREATE INDEX "DocumentChunk_embedding_hnsw_idx" ON "DocumentChunk"
  USING hnsw (embedding vector_cosine_ops);
