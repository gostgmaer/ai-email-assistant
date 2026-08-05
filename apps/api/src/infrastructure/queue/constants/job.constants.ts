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
