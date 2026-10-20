-- AlterEnum
ALTER TYPE "SyncStatus" ADD VALUE 'AUTH_REQUIRED';

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "aliasesRefreshedAt" TIMESTAMP(3),
ADD COLUMN     "consecutiveSyncFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nextSyncAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "aiError" TEXT,
ADD COLUMN     "aiFailedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "EmailMessage_providerMessageId_idx" ON "EmailMessage"("providerMessageId");

