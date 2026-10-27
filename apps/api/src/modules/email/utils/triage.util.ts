import { htmlToPlainText } from '../../ai/utils/signature.util';
import { stripQuotedHistory } from '../../ai/utils/thread-context.util';
import { findNoReplyReason } from '../../ai/utils/reply-need.util';
import { NormalizedParticipant } from '../interfaces';
import { isAutomatedAddress } from '../providers/bulk-mail.util';

export type Triage = 'NEEDS_REPLY' | 'FYI' | 'NOTIFICATION' | 'NEWSLETTER';

/** The fields of a thread's newest message that triage looks at. */
export interface TriageMessage {
  from: unknown;
  to: unknown;
  cc?: unknown;
  bodyText?: string | null;
  bodyHtml?: string | null;
  isAutoReply?: boolean;
  bulkKind?: Triage | null;
  category?: string | null;
  needsReply?: boolean | null;
}

function participants(value: unknown): NormalizedParticipant[] {
  return Array.isArray(value) ? (value as NormalizedParticipant[]) : [];
}

/**
 * Smart triage (docs/ai-features-implementation-plan.md, Phase 2): which
 * inbox group a thread belongs in, decided from its newest message alone.
 * No AI call — it reuses what sync and the AI pipeline already worked out,
 * and falls back to cheap rules for mail the pipeline never saw (history
 * imported by the first sync, which is most of a mailbox).
 *
 * In order:
 * 1. The user sent the newest message → FYI (nothing to answer; the
 *    Waiting page covers "they haven't replied").
 * 2. Sync judged it bulk mail → its bulkKind (NEWSLETTER/NOTIFICATION).
 * 3. A noreply-style sender (noreply, alerts, mailer-daemon) → NOTIFICATION.
 * 4. An automatic reply (out of office) → FYI.
 * 5. Classified as Marketing → NEWSLETTER.
 * 6. The AI pipeline decided needsReply → NEEDS_REPLY or FYI.
 * 7. Never classified: Cc-only or acknowledgement-only → FYI; a question
 *    (outside links) addressed to the user → NEEDS_REPLY; else FYI.
 */
export function decideTriage(
  message: TriageMessage,
  ownAddresses: string[],
): Triage {
  const own = new Set(ownAddresses.map((address) => address.toLowerCase()));
  const isOwn = (p: NormalizedParticipant) =>
    !!p?.address && own.has(p.address.toLowerCase());
  const sender = participants(message.from)[0];

  if (sender && isOwn(sender)) {
    return 'FYI';
  }
  if (
    message.bulkKind === 'NEWSLETTER' ||
    message.bulkKind === 'NOTIFICATION'
  ) {
    return message.bulkKind;
  }
  // Before the auto-reply and needsReply checks: a bounce from
  // mailer-daemon is an auto-reply too, but it's a notification, and the
  // AI never answers a noreply-style address anyway.
  if (isAutomatedAddress(sender?.address)) {
    return 'NOTIFICATION';
  }
  if (message.isAutoReply) {
    return 'FYI';
  }
  if (message.category?.toLowerCase() === 'marketing') {
    return 'NEWSLETTER';
  }
  if (message.needsReply === true) {
    return 'NEEDS_REPLY';
  }
  if (message.needsReply === false) {
    return 'FYI';
  }

  const latestText = stripQuotedHistory(
    message.bodyText?.trim()
      ? message.bodyText
      : htmlToPlainText(message.bodyHtml ?? ''),
  );
  if (findNoReplyReason(message, latestText, ownAddresses) !== null) {
    return 'FYI';
  }
  const addressedToUser = participants(message.to).some(isOwn);
  // Links carry "?" in their query strings (every calendar invitation
  // does); only a question in the words counts.
  const asksQuestion = latestText.replace(/\S+:\/\/\S+/g, ' ').includes('?');
  return addressedToUser && asksQuestion ? 'NEEDS_REPLY' : 'FYI';
}
