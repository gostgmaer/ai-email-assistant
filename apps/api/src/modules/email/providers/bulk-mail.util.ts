export interface BulkMailHeaders {
  listUnsubscribe?: string;
  listId?: string;
  precedence?: string;
  autoSubmitted?: string;
}

// Real-world test against a live inbox showed many automated senders (job
// boards, government portals, security-alert systems) never set the
// headers below — they just use a conventional local-part instead. This
// is a weaker signal than the headers (a real person could conceivably be
// named "noreply"), but false positives here only cost an AI classify
// call we'd have made anyway, while false negatives risk an autonomous
// reply to a bot.
// Substring match, not anchored — automated senders often prefix/suffix
// these words onto a brand name (e.g. "naukrialerts@naukri.com"), so a
// word-boundary or start-anchored match misses them.
const AUTOMATED_SENDER_LOCAL_PART =
  /no.?reply|do.?not.?reply|notification|alert|mailer.?daemon/i;

/**
 * Every legitimate newsletter, social notification, and automated /
 * transactional sender sets one of these headers — it's a deliverability
 * convention (RFC 2919, RFC 3834, and Gmail/Outlook's own bulk-sender
 * requirements), not a provider-specific label. Checking headers directly
 * means this works identically for Gmail, Outlook, and IMAP, unlike
 * Gmail's own `category:` search operator.
 */
export function isBulkMail(
  headers: BulkMailHeaders,
  senderAddress?: string,
): boolean {
  if (headers.listUnsubscribe || headers.listId) {
    return true;
  }

  if (headers.precedence && /\b(bulk|list|junk)\b/i.test(headers.precedence)) {
    return true;
  }

  if (headers.autoSubmitted && !/^no$/i.test(headers.autoSubmitted.trim())) {
    return true;
  }

  const localPart = senderAddress?.split('@')[0];
  if (localPart && AUTOMATED_SENDER_LOCAL_PART.test(localPart)) {
    return true;
  }

  return false;
}
