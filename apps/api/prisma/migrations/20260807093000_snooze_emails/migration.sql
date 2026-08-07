-- AlterTable
ALTER TABLE "EmailThread" ADD COLUMN     "snoozedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "EmailThread_snoozedUntil_idx" ON "EmailThread"("snoozedUntil");
