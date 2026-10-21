import {
  NotificationChannel,
  NotificationEvent,
} from '../../generated/prisma/enums';

export const NOTIFICATION_EVENTS: {
  event: NotificationEvent;
  label: string;
}[] = [
  { event: 'URGENT_MAIL', label: 'Urgent email arrives' },
  { event: 'APPROVAL_REQUESTED', label: 'Your approval is needed' },
  { event: 'DRAFT_READY', label: 'AI draft ready for review' },
  { event: 'SYNC_FAILED', label: 'A mailbox stops syncing' },
  { event: 'DIGEST', label: 'Daily digest' },
  { event: 'FOLLOW_UP', label: 'No reply to a message you sent' },
  { event: 'SNOOZE_WAKE', label: 'A snoozed thread is back' },
  { event: 'AUTOMATION', label: 'Auto-replies and other automation' },
];

export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  'IN_APP',
  'EMAIL',
  'SLACK',
];

/** What a missing NotificationPreference row means: in-app on, everything
 * that leaves the app off until the user turns it on. */
export function defaultEnabled(channel: NotificationChannel): boolean {
  return channel === 'IN_APP';
}
