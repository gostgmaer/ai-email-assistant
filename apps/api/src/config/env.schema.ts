import { z } from 'zod';

export const envSchema = z.object({
  // App
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),

  // Database
  DATABASE_URL: z.url(),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // Encryption (AES-256-GCM key for provider credentials at rest, 32 bytes hex-encoded)
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, {
    message: 'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)',
  }),

  // Frontend (OAuth redirect target)
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // Google
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().min(1),
  GOOGLE_MAIL_CALLBACK_URL: z.string().min(1),

  // Microsoft
  MICROSOFT_CLIENT_ID: z.string().min(1),
  MICROSOFT_CLIENT_SECRET: z.string().min(1),
  MICROSOFT_CALLBACK_URL: z.string().min(1),
  MICROSOFT_MAIL_CALLBACK_URL: z.string().min(1),

  // Slack (v3.0 Integrations — first provider, see docs/v2.0-plan.md §5).
  // Optional unlike Google/Microsoft: this is a new, opt-in feature, not a
  // core auth flow every deployment already has credentials for. Unset
  // means the connect route throws a clear error instead of the whole app
  // failing to boot.
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_CALLBACK_URL: z.string().optional(),

  // Microsoft Teams — reuses the same Azure AD app registration as
  // MICROSOFT_CLIENT_ID/SECRET above (Microsoft Graph), just a different
  // redirect URI and scope set (Team.ReadBasic.All, Channel.ReadBasic.All,
  // ChannelMessage.Send) requested at connect time. Optional, same posture
  // as Slack above.
  MICROSOFT_TEAMS_CALLBACK_URL: z.string().optional(),

  // HubSpot — optional, same posture as Slack above.
  HUBSPOT_CLIENT_ID: z.string().optional(),
  HUBSPOT_CLIENT_SECRET: z.string().optional(),
  HUBSPOT_CALLBACK_URL: z.string().optional(),

  // AI
  AI_SERVICE_URL: z.url(),
  AI_SERVICE_API_KEY: z.string().optional(),

  // Automation safety (see docs/email-automation-implementation-plan.md).
  // AUTO_SEND_ENABLED is a global kill switch: "false" turns every reply a
  // rule would auto-send into a draft, across all accounts. An enum, not
  // z.coerce.boolean() — coerce treats the string "false" as true.
  AUTO_SEND_ENABLED: z.enum(['true', 'false']).default('true'),
  // Inbound mail older than this never enters the AI pipeline, so a
  // backfill/resync can't trigger replies to stale conversations.
  AI_MAX_MESSAGE_AGE_HOURS: z.coerce.number().positive().default(48),
  // Per-request timeout for calls to the AI service (reply generation and
  // document processing get a multiple of it — see AiClientService).
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  // How many AI jobs one worker process runs at once.
  AI_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  // Newest messages listed per folder when a folder is (re)baselined —
  // first sync, or an expired change cursor. Everything after that comes
  // from change tracking, not this window.
  INITIAL_SYNC_LIMIT: z.coerce.number().int().positive().default(50),

  // File Upload Service (@easydev_org/file-upload-sdk) — document uploads go
  // here instead of being held in memory; the AI service downloads directly
  // from it using the same HMAC scheme (see FILE_SERVICE_HMAC_SECRET below,
  // which apps/ai also needs a copy of).
  FILE_SERVICE_URL: z.url().default('http://localhost:4001'),
  FILE_SERVICE_HMAC_SECRET: z.string().min(1),
  FILE_SERVICE_TENANT_ID: z.string().default('easydev'),

  // Mailer (transactional emails: verification, password reset, email change).
  // All optional — when SMTP_HOST is unset, MailerService logs links to the
  // console instead of sending, so auth flows still work in local dev.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('AI Email Assistant <no-reply@localhost>'),

  // Observability — optional; when unset, Sentry.init() is skipped in
  // main.ts and the app runs without error tracking (see docs/deployment.md).
  SENTRY_DSN: z.string().optional(),

  // Logger
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

export type Env = z.infer<typeof envSchema>;
