-- AlterTable
ALTER TABLE "DocumentChunk" ADD COLUMN     "metadata" JSONB NOT NULL DEFAULT '{}';
