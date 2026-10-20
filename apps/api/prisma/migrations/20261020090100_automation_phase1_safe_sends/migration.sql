-- CreateEnum
CREATE TYPE "AutomationEffectKind" AS ENUM ('RULE_ACTIONS', 'TASK_EXTRACTION', 'SEND', 'DRAFT');

-- CreateEnum
CREATE TYPE "AutomationEffectStatus" AS ENUM ('PENDING', 'DONE');

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "aiEnabledFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "aiEdited" BOOLEAN,
ADD COLUMN     "isAutoReply" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AutomationEffect" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "kind" "AutomationEffectKind" NOT NULL,
    "status" "AutomationEffectStatus" NOT NULL DEFAULT 'PENDING',
    "recipient" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationEffect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationEffect_accountId_kind_createdAt_idx" ON "AutomationEffect"("accountId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationEffect_threadId_kind_createdAt_idx" ON "AutomationEffect"("threadId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationEffect_messageId_kind_key" ON "AutomationEffect"("messageId", "kind");

-- AddForeignKey
ALTER TABLE "AutomationEffect" ADD CONSTRAINT "AutomationEffect_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

