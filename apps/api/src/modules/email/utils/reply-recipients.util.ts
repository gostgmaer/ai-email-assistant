import { NormalizedParticipant } from '../interfaces';

export interface ReplySource {
  from: unknown;
  to: unknown;
  cc?: unknown;
  replyTo?: unknown;
  messageIdHeader?: string | null;
  references?: string[] | null;
}

function participants(value: unknown): NormalizedParticipant[] {
  return Array.isArray(value)
    ? (value as NormalizedParticipant[]).filter((p) => !!p?.address)
    : [];
}

function dedupe(list: NormalizedParticipant[]): NormalizedParticipant[] {
  const seen = new Set<string>();
  return list.filter((p) => {
    const key = p.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Who a reply to `original` goes to.
 * - Reply-To wins over From when present (contact forms, help desks and
 *   mailing lists set it precisely so replies go somewhere other than the
 *   sending address).
 * - The user's own addresses (primary + aliases) are never recipients.
 * - Replying to the user's own message (e.g. a follow-up on something
 *   they sent) goes to that message's original recipients instead.
 * - replyAll adds the original To/Cc as Cc — previously everyone CC'd on
 *   a conversation was silently dropped from every reply.
 */
export function buildReplyRecipients(
  original: ReplySource,
  ownAddresses: string[],
  replyAll = false,
): { to: NormalizedParticipant[]; cc: NormalizedParticipant[] } {
  const own = new Set(ownAddresses.map((a) => a.toLowerCase()));
  const notOwn = (p: NormalizedParticipant) =>
    !own.has(p.address.toLowerCase());

  const replyTo = participants(original.replyTo);
  const from = participants(original.from);
  const originalTo = participants(original.to);
  const originalCc = participants(original.cc);

  let to = dedupe((replyTo.length > 0 ? replyTo : from).filter(notOwn));
  if (to.length === 0) {
    to = dedupe(originalTo.filter(notOwn));
  }

  const toKeys = new Set(to.map((p) => p.address.toLowerCase()));
  const cc = replyAll
    ? dedupe(
        [...from, ...originalTo, ...originalCc].filter(
          (p) => notOwn(p) && !toKeys.has(p.address.toLowerCase()),
        ),
      )
    : [];

  return { to, cc };
}

/** In-Reply-To / References for a reply (RFC 5322 §3.6.4): the parent's
 * Message-ID, and the parent's References followed by its Message-ID. */
export function buildThreadingHeaders(original: ReplySource): {
  inReplyToHeader?: string;
  referencesHeader?: string[];
} {
  const messageId = original.messageIdHeader ?? undefined;
  if (!messageId) {
    return {};
  }

  return {
    inReplyToHeader: messageId,
    referencesHeader: [
      ...(original.references ?? []).filter((ref) => ref !== messageId),
      messageId,
    ],
  };
}

/** Message-IDs out of a References / In-Reply-To header value. */
export function parseMessageIdList(value?: string | string[]): string[] {
  const text = Array.isArray(value) ? value.join(' ') : (value ?? '');
  return text.match(/<[^<>\s]+>/g) ?? [];
}
