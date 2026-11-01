-- CreateEnum
CREATE TYPE "AiDraftDiscardReason" AS ENUM ('WRONG_FACTS', 'WRONG_TONE', 'SHOULD_NOT_REPLY', 'TOO_LONG', 'OTHER');

-- CreateEnum
CREATE TYPE "ImprovementSuggestionKind" AS ENUM ('AGENT_INSTRUCTION', 'HOLD_DOMAIN', 'HOLD_CATEGORY');

-- CreateEnum
CREATE TYPE "ImprovementSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');


-- AlterTable
ALTER TABLE "AiDraftOutcome" ADD COLUMN     "category" TEXT,
ADD COLUMN     "discardReason" "AiDraftDiscardReason",
ADD COLUMN     "draftText" TEXT,
ADD COLUMN     "heldBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "senderDomain" TEXT,
ADD COLUMN     "sentText" TEXT;

-- CreateTable
CREATE TABLE "ImprovementSuggestion" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" "ImprovementSuggestionKind" NOT NULL,
    "target" TEXT NOT NULL,
    "change" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" "ImprovementSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImprovementSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImprovementSuggestion_accountId_status_createdAt_idx" ON "ImprovementSuggestion"("accountId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "ImprovementSuggestion" ADD CONSTRAINT "ImprovementSuggestion_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

