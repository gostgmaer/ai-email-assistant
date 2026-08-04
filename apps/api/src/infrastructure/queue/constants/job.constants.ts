export const EmailSyncJobs = {
  InitialSync: 'initial-sync',
  IncrementalSync: 'incremental-sync',
  SyncFolders: 'sync-folders',
} as const;

export const AIJobs = {
  SummarizeEmail: 'summarize-email',
  DraftReply: 'draft-reply',
  RewriteReply: 'rewrite-reply',
  ClassifyEmail: 'classify-email',
} as const;

export const NotificationJobs = {
  SendEmail: 'send-email',
} as const;
