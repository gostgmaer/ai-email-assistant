-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AutomationEffectStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "AutomationEffectStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "autoSendConfidenceThreshold" INTEGER NOT NULL DEFAULT 70,
ADD COLUMN     "autoSendDailyCap" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "autoSendHourlyCap" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "businessDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
ADD COLUMN     "businessHoursEnd" TEXT NOT NULL DEFAULT '17:00',
ADD COLUMN     "businessHoursStart" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "quietHoursEnd" TEXT,
ADD COLUMN     "quietHoursStart" TEXT,
ADD COLUMN     "signatureHtml" TEXT,
ADD COLUMN     "signatureText" TEXT,
ADD COLUMN     "undoSendSeconds" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "scheduledSendAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AutomationEffect" ADD COLUMN     "details" JSONB;

-- CreateTable
CREATE TABLE "RuleExecution" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "ruleId" TEXT,
    "ruleName" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "actions" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RuleExecution_accountId_createdAt_idx" ON "RuleExecution"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "RuleExecution_ruleId_createdAt_idx" ON "RuleExecution"("ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "RuleExecution_messageId_idx" ON "RuleExecution"("messageId");

-- AddForeignKey
ALTER TABLE "RuleExecution" ADD CONSTRAINT "RuleExecution_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleExecution" ADD CONSTRAINT "RuleExecution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "WorkflowRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleExecution" ADD CONSTRAINT "RuleExecution_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Rule conditions v1 -> v2. v1 was a flat list, all ANDed:
--   [{ "field", "operator", "value" }]
-- v2 is a group tree: { "all": [{ "field", "op", "value" }] }. An empty v1
-- list matched every message; v2 has to say that explicitly (matchAll).
UPDATE "WorkflowRule"
SET "conditions" = CASE
  WHEN jsonb_array_length("conditions") = 0
    THEN '{"all": [], "matchAll": true}'::jsonb
  ELSE jsonb_build_object(
    'all',
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'field', c -> 'field',
          'op', c -> 'operator',
          'value', c -> 'value'
        )
      )
      FROM jsonb_array_elements("conditions") AS c
    )
  )
END
WHERE jsonb_typeof("conditions") = 'array';
