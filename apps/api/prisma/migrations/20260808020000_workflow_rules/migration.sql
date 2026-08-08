-- CreateTable
CREATE TABLE "WorkflowRule" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowRule_accountId_order_idx" ON "WorkflowRule"("accountId", "order");

-- AddForeignKey
ALTER TABLE "WorkflowRule" ADD CONSTRAINT "WorkflowRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one WorkflowRule per (account, category) that was previously
-- in EmailAccount.autoSendCategories, before that column is dropped below.
-- Preserves existing auto-send configuration instead of silently
-- discarding it — see docs/v2.0-plan.md §3's "Open decisions".
INSERT INTO "WorkflowRule" ("id", "accountId", "name", "enabled", "order", "conditions", "actions", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  "id",
  'Auto-reply: ' || category,
  true,
  0,
  jsonb_build_array(jsonb_build_object('field', 'category', 'operator', 'equals', 'value', category)),
  jsonb_build_array(jsonb_build_object('type', 'AUTO_REPLY')),
  now(),
  now()
FROM "EmailAccount", unnest("autoSendCategories") AS category
WHERE cardinality("autoSendCategories") > 0;

-- AlterTable
ALTER TABLE "EmailAccount" DROP COLUMN "autoSendCategories";
