
-- CreateTable
CREATE TABLE "ThreadMetrics" (
    "threadId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "firstInboundAt" TIMESTAMP(3) NOT NULL,
    "firstResponseAt" TIMESTAMP(3),
    "responseMs" BIGINT,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreadMetrics_pkey" PRIMARY KEY ("threadId")
);

-- CreateTable
CREATE TABLE "InsightsSnapshot" (
    "accountId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsightsSnapshot_pkey" PRIMARY KEY ("accountId")
);

-- CreateIndex
CREATE INDEX "ThreadMetrics_accountId_firstInboundAt_idx" ON "ThreadMetrics"("accountId", "firstInboundAt");

-- AddForeignKey
ALTER TABLE "ThreadMetrics" ADD CONSTRAINT "ThreadMetrics_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadMetrics" ADD CONSTRAINT "ThreadMetrics_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightsSnapshot" ADD CONSTRAINT "InsightsSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

