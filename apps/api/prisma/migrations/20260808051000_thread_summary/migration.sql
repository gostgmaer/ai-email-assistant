-- AlterTable
ALTER TABLE "EmailThread" ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summaryKeyPoints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
