import { NormalizedParticipant } from '../../email/interfaces';

/**
 * Deterministic "this doesn't need a reply" checks run before the LLM's
 * own needs_reply judgement (docs/email-automation-gaps.md G-15) — cheap,
 * predictable, and they cover the most common noise: a full reply was
 * being generated (~6 LLM calls) for every "Thanks!" and every message the
 * user was merely copied on.
 */

// An acknowledgement and nothing else: no question, no request.
const ACKNOWLEDGEMENT =
  /^(thanks?( (you|so much|a lot|again))?|thank you( (so|very) much)?|thx|ty|many thanks|cheers|got it|noted|ok(ay)?|perfect|great|sounds good|will do|appreciate it|much appreciated|received|👍|🙏)[\s!.,:)\-–—]*([\p{L} ,.!'-]{0,40})?$/iu;

const MAX_ACK_WORDS = 15;

function participants(value: unknown): NormalizedParticipant[] {
  return Array.isArray(value) ? (value as NormalizedParticipant[]) : [];
}

/**
 * Returns why the message needs no reply, or null to defer to the LLM.
 * `latestText` is the message body with quoted history already stripped.
 */
export function findNoReplyReason(
  message: { to: unknown; cc?: unknown },
  latestText: string,
  ownAddresses: string[],
): string | null {
  const own = new Set(ownAddresses.map((address) => address.toLowerCase()));
  const isOwn = (p: NormalizedParticipant) =>
    !!p?.address && own.has(p.address.toLowerCase());

  const to = participants(message.to);
  const cc = participants(message.cc);
  if (!to.some(isOwn) && cc.some(isOwn)) {
    return 'you were only copied (Cc)';
  }

  const text = latestText.trim();
  const words = text.split(/\s+/).filter(Boolean);
  if (
    words.length > 0 &&
    words.length <= MAX_ACK_WORDS &&
    !text.includes('?') &&
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      // A short sign-off line ("Sam", "Best, Sam") is allowed after it.
      .every(
        (line, index) =>
          ACKNOWLEDGEMENT.test(line) ||
          (index > 0 && line.split(/\s+/).length <= 3),
      )
  ) {
    return 'acknowledgement only';
  }

  return null;
}
