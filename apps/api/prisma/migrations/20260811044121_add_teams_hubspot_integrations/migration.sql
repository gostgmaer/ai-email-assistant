-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntegrationProvider" ADD VALUE 'TEAMS';
ALTER TYPE "IntegrationProvider" ADD VALUE 'HUBSPOT';

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "refreshToken" TEXT;
