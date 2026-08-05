-- AlterTable
ALTER TABLE "EmailAccount"
  ADD COLUMN "filterMarketing" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "filterOtp" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "filterPasswordReset" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "filterBilling" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "filterShipping" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "filterCalendar" BOOLEAN NOT NULL DEFAULT true;
