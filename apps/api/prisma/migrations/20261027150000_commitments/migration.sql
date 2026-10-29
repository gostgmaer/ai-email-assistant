-- AlterEnum
ALTER TYPE "NotificationEvent" ADD VALUE 'COMMITMENT_DUE';

-- AlterEnum
ALTER TYPE "TaskType" ADD VALUE 'COMMITMENT';

-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "commitmentScanPending" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "remindedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "EmailMessage_commitmentScanPending_receivedAt_idx" ON "EmailMessage"("commitmentScanPending", "receivedAt");

-- CreateIndex
CREATE INDEX "Task_type_status_dueDate_idx" ON "Task"("type", "status", "dueDate");

-- Queue the user's own mail from the last 14 days for the commitment scan
-- (the same window the scan itself accepts); older history is never read.
UPDATE "EmailMessage" m
SET "commitmentScanPending" = true
FROM "EmailThread" t
JOIN "EmailAccount" a ON a.id = t."accountId"
JOIN "MailFolder" f ON f.id = t."folderId"
WHERE m."threadId" = t.id
  AND m."receivedAt" > now() - interval '14 days'
  AND f.type <> 'DRAFTS'
  AND (
    lower(m."from"->0->>'address') = lower(a.email)
    OR lower(m."from"->0->>'address') = ANY(a.aliases)
  );
