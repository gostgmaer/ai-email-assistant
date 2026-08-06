-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PROCESSING', 'INDEXED', 'FAILED');

-- AlterTable: add nullable first so existing rows can be backfilled below
-- before the NOT NULL columns (title, documentType, fileExtension,
-- fileSize, updatedAt) are enforced.
ALTER TABLE "Document"
  ADD COLUMN     "author" TEXT,
  ADD COLUMN     "category" TEXT,
  ADD COLUMN     "description" TEXT,
  ADD COLUMN     "documentType" TEXT,
  ADD COLUMN     "fileExtension" TEXT,
  ADD COLUMN     "fileSize" INTEGER,
  ADD COLUMN     "indexedAt" TIMESTAMP(3),
  ADD COLUMN     "lastAccessedAt" TIMESTAMP(3),
  ADD COLUMN     "sourceType" TEXT NOT NULL DEFAULT 'upload',
  ADD COLUMN     "status" "DocumentStatus" NOT NULL DEFAULT 'INDEXED',
  ADD COLUMN     "summary" TEXT,
  ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN     "title" TEXT,
  ADD COLUMN     "totalCharacters" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN     "totalChunks" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN     "totalTokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- Backfill pre-existing rows (predate these columns) from data already on
-- the row, then lock the columns down to NOT NULL.
UPDATE "Document"
SET
  "title" = "filename",
  "documentType" = COALESCE(NULLIF(lower(split_part("filename", '.', -1)), "filename"), "contentType"),
  "fileExtension" = COALESCE(NULLIF(lower(split_part("filename", '.', -1)), "filename"), ''),
  "fileSize" = 0,
  "indexedAt" = "createdAt",
  "updatedAt" = "createdAt",
  "totalChunks" = (SELECT count(*) FROM "DocumentChunk" WHERE "DocumentChunk"."documentId" = "Document"."id")
WHERE "title" IS NULL;

ALTER TABLE "Document"
  ALTER COLUMN "documentType" SET NOT NULL,
  ALTER COLUMN "fileExtension" SET NOT NULL,
  ALTER COLUMN "fileSize" SET NOT NULL,
  ALTER COLUMN "title" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL,
  ALTER COLUMN "status" DROP DEFAULT;

-- Restore the ordinary "new documents start at PROCESSING" default now
-- that pre-existing rows have been explicitly backfilled to INDEXED above.
ALTER TABLE "Document" ALTER COLUMN "status" SET DEFAULT 'PROCESSING';

-- AlterTable
ALTER TABLE "DocumentChunk"
  ADD COLUMN     "characterCount" INTEGER,
  ADD COLUMN     "chunkType" TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN     "contentHash" TEXT,
  ADD COLUMN     "entities" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN     "importance" INTEGER,
  ADD COLUMN     "keywords" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN     "page" INTEGER,
  ADD COLUMN     "section" TEXT,
  ADD COLUMN     "tokenCount" INTEGER,
  ADD COLUMN     "updatedAt" TIMESTAMP(3),
  ADD COLUMN     "wordCount" INTEGER;

UPDATE "DocumentChunk" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

ALTER TABLE "DocumentChunk" ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "Document_category_idx" ON "Document"("category");

-- CreateIndex
CREATE INDEX "Document_indexedAt_idx" ON "Document"("indexedAt");

-- CreateIndex
CREATE INDEX "DocumentChunk_page_idx" ON "DocumentChunk"("page");

-- CreateIndex
CREATE INDEX "DocumentChunk_section_idx" ON "DocumentChunk"("section");

-- CreateIndex
CREATE INDEX "DocumentChunk_chunkType_idx" ON "DocumentChunk"("chunkType");
