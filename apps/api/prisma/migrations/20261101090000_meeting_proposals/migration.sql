
-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "meetingProposal" JSONB,
ADD COLUMN     "pickCheckedAt" TIMESTAMP(3),
ADD COLUMN     "pickedSlotIndex" INTEGER,
ADD COLUMN     "proposedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Task_type_status_proposedAt_idx" ON "Task"("type", "status", "proposedAt");

