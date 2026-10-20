export const QueueNames = {
  EmailSync: 'email-sync',
  AI: 'ai',
  Notification: 'notification',
  Documents: 'documents',
  Digest: 'digest',
  Approvals: 'approvals',
  Automation: 'automation',
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];
