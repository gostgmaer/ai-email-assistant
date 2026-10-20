-- AlterTable
ALTER TABLE "EmailThread" ADD COLUMN     "lastMessageFromSelf" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "needsReply" BOOLEAN,
ADD COLUMN     "replyReason" TEXT;

-- CreateIndex
CREATE INDEX "EmailThread_lastMessageFromSelf_lastMessageAt_idx" ON "EmailThread"("lastMessageFromSelf", "lastMessageAt");


-- Backfill: mark threads whose newest message was sent by the account
-- (its own address or one of its aliases), so existing follow-up
-- candidates are found immediately rather than only after new mail.
UPDATE "EmailThread" AS t
SET "lastMessageFromSelf" = true
FROM (
  SELECT DISTINCT ON (m."threadId")
    m."threadId",
    lower(m."from"->0->>'address') AS sender
  FROM "EmailMessage" AS m
  ORDER BY m."threadId", m."receivedAt" DESC
) AS latest
JOIN "EmailAccount" AS a ON true
WHERE latest."threadId" = t."id"
  AND a."id" = t."accountId"
  AND (latest.sender = lower(a."email") OR latest.sender = ANY(a."aliases"));
