-- Smart triage (docs/ai-features-implementation-plan.md, Phase 2)

-- CreateEnum
CREATE TYPE "ThreadTriage" AS ENUM ('NEEDS_REPLY', 'FYI', 'NOTIFICATION', 'NEWSLETTER');

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "keepNewsletters" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "bulkKind" "ThreadTriage",
ADD COLUMN     "listUnsubscribe" TEXT,
ADD COLUMN     "listUnsubscribePost" TEXT;

-- AlterTable
ALTER TABLE "EmailThread" ADD COLUMN     "triage" "ThreadTriage";

-- CreateIndex
CREATE INDEX "EmailThread_accountId_triage_idx" ON "EmailThread"("accountId", "triage");
