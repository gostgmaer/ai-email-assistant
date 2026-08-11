-- AlterEnum
ALTER TYPE "ApprovalStepStatus" ADD VALUE 'WAITING';

-- AlterTable
ALTER TABLE "ApprovalStep" ALTER COLUMN "status" SET DEFAULT 'WAITING';
