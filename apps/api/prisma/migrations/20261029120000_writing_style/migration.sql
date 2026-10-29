-- CreateTable
CREATE TABLE "WritingStyleProfile" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "profile" JSONB NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "builtAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WritingStyleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WritingStyleProfile_accountId_key" ON "WritingStyleProfile"("accountId");

-- AddForeignKey
ALTER TABLE "WritingStyleProfile" ADD CONSTRAINT "WritingStyleProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

