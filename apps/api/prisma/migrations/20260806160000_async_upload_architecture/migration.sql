-- DropIndex
-- chunkContentHash is now informational only (see the field comment) —
-- upload and processing are decoupled, so it's no longer known at
-- upload time and can't gate a pre-upload duplicate check the way it
-- used to. Enforcing uniqueness on it now just causes spurious
-- constraint violations when two differently-named files happen to
-- extract to identical text.
DROP INDEX "Document_userId_chunkContentHash_key";

-- AlterTable
-- provider/model are only known once the AI service actually processes
-- the document — upload (this table's INSERT) now happens before that,
-- not synchronously as part of it.
ALTER TABLE "Document" ALTER COLUMN "provider" DROP NOT NULL,
ALTER COLUMN "model" DROP NOT NULL;
