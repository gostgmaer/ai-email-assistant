-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "language" TEXT,
ADD COLUMN     "containsPii" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "piiTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
