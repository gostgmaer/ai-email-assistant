-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN "autoSendCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN "inReplyToMessageId" TEXT,
ADD COLUMN "aiProcessedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "EmailMessage_inReplyToMessageId_idx" ON "EmailMessage"("inReplyToMessageId");

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_inReplyToMessageId_fkey" FOREIGN KEY ("inReplyToMessageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ContactMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "senderName" TEXT,
    "facts" JSONB NOT NULL,
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactMemory_userId_senderEmail_key" ON "ContactMemory"("userId", "senderEmail");

-- CreateIndex
CREATE INDEX "ContactMemory_userId_idx" ON "ContactMemory"("userId");

-- AddForeignKey
ALTER TABLE "ContactMemory" ADD CONSTRAINT "ContactMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
