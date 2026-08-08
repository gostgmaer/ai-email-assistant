-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "prohibitedPhrases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
