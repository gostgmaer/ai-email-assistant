-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('SLACK');

-- DropIndex
DROP INDEX "DocumentChunk_embedding_hnsw_idx";

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "workspaceId" TEXT,
    "workspaceName" TEXT,
    "accessToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Integration_accountId_idx" ON "Integration"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_accountId_provider_key" ON "Integration"("accountId", "provider");

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
