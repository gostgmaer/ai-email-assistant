export const QueueNames = {
  EmailSync: 'email-sync',
  AI: 'ai',
  Notification: 'notification',
  Documents: 'documents',
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];
