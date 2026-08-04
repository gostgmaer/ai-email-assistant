-- Synced mail cache is fully recoverable via re-sync, so clear it instead
-- of writing a data migration to merge the duplicate threads that the old
-- per-folder scoping produced (e.g. one thread row per Gmail label).
TRUNCATE TABLE "EmailMessage", "EmailThread", "MailFolder" RESTART IDENTITY CASCADE;

-- DropIndex
DROP INDEX "EmailThread_folderId_providerThreadId_key";

-- AlterTable
ALTER TABLE "EmailThread" ADD COLUMN "accountId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EmailThread_accountId_providerThreadId_key" ON "EmailThread"("accountId", "providerThreadId");

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
