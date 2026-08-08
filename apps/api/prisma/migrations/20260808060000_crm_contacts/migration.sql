-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_accountId_idx" ON "Contact"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_accountId_email_key" ON "Contact"("accountId", "email");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
