-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "chunkOverlap" INTEGER,
ADD COLUMN     "chunkSize" INTEGER,
ADD COLUMN     "embeddingDimension" INTEGER NOT NULL DEFAULT 768,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "metadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "owner" TEXT,
ADD COLUMN     "pageCount" INTEGER,
ADD COLUMN     "parser" TEXT,
ADD COLUMN     "sourceName" TEXT,
ADD COLUMN     "sourcePath" TEXT,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "splitter" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "DocumentChunk" ADD COLUMN     "embeddingDimension" INTEGER NOT NULL DEFAULT 768,
ADD COLUMN     "embeddingModel" TEXT,
ADD COLUMN     "embeddingVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "endChar" INTEGER,
ADD COLUMN     "lineEnd" INTEGER,
ADD COLUMN     "lineStart" INTEGER,
ADD COLUMN     "parentChunkId" TEXT,
ADD COLUMN     "startChar" INTEGER;

-- CreateIndex
CREATE INDEX "Document_sourceType_idx" ON "Document"("sourceType");

-- CreateIndex
CREATE INDEX "Document_language_idx" ON "Document"("language");

-- CreateIndex
CREATE INDEX "Document_version_idx" ON "Document"("version");

-- CreateIndex
CREATE INDEX "DocumentChunk_tokenCount_idx" ON "DocumentChunk"("tokenCount");

-- CreateIndex
CREATE INDEX "DocumentChunk_parentChunkId_idx" ON "DocumentChunk"("parentChunkId");

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_parentChunkId_fkey" FOREIGN KEY ("parentChunkId") REFERENCES "DocumentChunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

