-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApprovalChainStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "ApprovalChainStatus" ADD VALUE 'CANCELLED';

-- DropForeignKey
ALTER TABLE "ApprovalChain" DROP CONSTRAINT "ApprovalChain_draftMessageId_fkey";

-- AlterTable
ALTER TABLE "ApprovalChain" ADD COLUMN     "draftRecipients" JSONB,
ADD COLUMN     "draftSubject" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3),
ADD COLUMN     "sentMessageId" TEXT,
ALTER COLUMN "draftMessageId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "messageIdHeader" TEXT,
ADD COLUMN     "references" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "replyTo" JSONB;

-- CreateIndex
CREATE INDEX "ApprovalChain_status_expiresAt_idx" ON "ApprovalChain"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "ApprovalChain" ADD CONSTRAINT "ApprovalChain_draftMessageId_fkey" FOREIGN KEY ("draftMessageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill the snapshot for chains created before it existed, so their
-- audit record stays meaningful once the draft is sent/deleted.
UPDATE "ApprovalChain" AS c
SET "draftSubject" = m."subject",
    "draftRecipients" = m."to"
FROM "EmailMessage" AS m
WHERE c."draftMessageId" = m."id";
