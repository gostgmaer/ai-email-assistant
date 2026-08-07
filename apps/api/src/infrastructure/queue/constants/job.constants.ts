export const EmailSyncJobs = {
  InitialSync: 'initial-sync',
  IncrementalSync: 'incremental-sync',
  SyncFolders: 'sync-folders',
  /** Repeatable fan-out job: enqueues an IncrementalSync for every active account. */
  BackgroundScan: 'background-scan',
} as const;

export const AIJobs = {
  SummarizeEmail: 'summarize-email',
  DraftReply: 'draft-reply',
  RewriteReply: 'rewrite-reply',
  ClassifyEmail: 'classify-email',
  /** Autonomous pipeline: classify -> contact memory -> reply -> auto-send or draft. */
  ProcessMessage: 'process-message',
} as const;

export const NotificationJobs = {
  SendEmail: 'send-email',
} as const;

export const DigestJobs = {
  /** Repeatable job (cron, once daily): fans out a SendForUser job for
   * every user with at least one active email account. */
  BuildAll: 'build-all-digests',
  SendForUser: 'send-digest-for-user',
} as const;

export const DocumentJobs = {
  /** Repeatable job: marks documents stuck at PROCESSING (a crashed or
   * never-finished upload) as FAILED once they're older than the stale
   * threshold. */
  CleanupStale: 'cleanup-stale-documents',
  /** Upload has finished (apps/api only stored metadata + uploaded the raw
   * file to file-upload-service) — the AI service downloads the file
   * itself and does the actual parsing/chunking/embedding work. */
  Process: 'process-document',
} as const;
