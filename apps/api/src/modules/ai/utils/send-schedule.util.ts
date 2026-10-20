import { quietHoursEnd } from '../../../common/utils/local-time.util';

/**
 * When an approved auto-reply should actually go out, or null for "now"
 * (docs/email-automation-implementation-plan.md §5.4). It waits for the
 * longer of the account's undo window and a matched rule's DELAY_SEND,
 * then — if that lands in the account's quiet hours — until they end.
 */
export function scheduleAutoSend(
  now: Date,
  options: {
    undoSendSeconds: number;
    delaySendMinutes?: number;
    quietHours: { start: string | null; end: string | null };
    timezone: string;
  },
): Date | null {
  const waitMs = Math.max(
    options.undoSendSeconds * 1000,
    (options.delaySendMinutes ?? 0) * 60_000,
  );
  const earliest = new Date(now.getTime() + waitMs);
  const sendAt =
    quietHoursEnd(earliest, options.timezone, options.quietHours) ?? earliest;

  return sendAt.getTime() > now.getTime() ? sendAt : null;
}
