-- Backfill: give every pre-existing account (connected before
-- EmailAccountService.seedDefaultAutomation existed) the same starter
-- Agent + disabled catch-all auto-reply WorkflowRule that new connects now
-- get automatically. Without this, "auto-reply" stays invisible to anyone
-- who connected their inbox before this feature shipped. The rule is
-- created disabled — same human-approval-first posture as everywhere else;
-- this only makes auto-reply one click away in Settings, it doesn't turn
-- it on. Skips any account that already has an Agent (idempotent, and
-- doesn't fight with a user who's already set up their own agents/rules).
WITH new_agents AS (
  INSERT INTO "Agent" ("id", "accountId", "name", "systemPrompt", "enabled", "createdAt", "updatedAt")
  SELECT
    gen_random_uuid(),
    ea."id",
    'Personal Assistant',
    'You are a personal assistant replying on behalf of this individual''s own inbox — not a business representative. Keep the tone warm and natural, matching how casually or formally the other person wrote. Handle everyday personal correspondence: confirming plans, replying to friends or family, routine appointments and admin. Never invent personal details, plans, or commitments that aren''t already in the thread — if it''s unclear what this person would want to say, keep the reply short and note what''s uncertain rather than guessing on their behalf.',
    true,
    now(),
    now()
  FROM "EmailAccount" ea
  WHERE ea."deletedAt" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "Agent" a WHERE a."accountId" = ea."id")
  RETURNING "id", "accountId"
)
INSERT INTO "WorkflowRule" ("id", "accountId", "name", "enabled", "order", "conditions", "actions", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  na."accountId",
  'Auto-reply — all messages (starter rule)',
  false,
  1000,
  '[]'::jsonb,
  jsonb_build_array(jsonb_build_object('type', 'AUTO_REPLY', 'agentId', na."id"::text)),
  now(),
  now()
FROM new_agents na;
