-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('URGENT_MAIL', 'APPROVAL_REQUESTED', 'DRAFT_READY', 'SYNC_FAILED', 'DIGEST', 'FOLLOW_UP', 'SNOOZE_WAKE', 'AUTOMATION');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SLACK');

-- CreateEnum
CREATE TYPE "AiDraftOutcomeKind" AS ENUM ('SENT', 'DISCARDED', 'AUTO_SENT');

-- AlterEnum
ALTER TYPE "TaskType" ADD VALUE 'FOLLOW_UP';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "digestHour" INTEGER NOT NULL DEFAULT 8;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "event" "NotificationEvent";

-- AlterTable
ALTER TABLE "EmailThread" ADD COLUMN     "followUpAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "slackIntegrationId" TEXT,
    "slackChannelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "providerAttachmentId" TEXT NOT NULL,
    "contentId" TEXT,
    "isInline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiDraftOutcome" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "agentId" TEXT,
    "outcome" "AiDraftOutcomeKind" NOT NULL,
    "edited" BOOLEAN,
    "editDistance" DOUBLE PRECISION,
    "timeToSendMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiDraftOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_event_channel_key" ON "NotificationPreference"("userId", "event", "channel");

-- CreateIndex
CREATE INDEX "EmailAttachment_messageId_idx" ON "EmailAttachment"("messageId");

-- CreateIndex
CREATE INDEX "AiDraftOutcome_accountId_createdAt_idx" ON "AiDraftOutcome"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "AiDraftOutcome_agentId_createdAt_idx" ON "AiDraftOutcome"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailThread_followUpAt_idx" ON "EmailThread"("followUpAt");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

