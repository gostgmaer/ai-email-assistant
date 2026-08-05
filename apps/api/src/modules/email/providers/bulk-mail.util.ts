export interface BulkMailHeaders {
  listUnsubscribe?: string;
  listId?: string;
  precedence?: string;
  autoSubmitted?: string;
  /** Presence (any value) means the sender doesn't want auto-replies — a
   * strong bulk/transactional signal on its own. */
  autoResponseSuppress?: string;
  /** Feedback-loop identifier bulk senders attach for spam-complaint
   * tracking (Yahoo/Gmail postmaster tooling). Presence alone is enough. */
  feedbackId?: string;
  /** True if any header name starts with X-Mailgun/X-SG/X-Sendgrid — these
   * identify the SENDING INFRASTRUCTURE (an ESP used by countless
   * unrelated senders), not a specific company, so this isn't a
   * vendor-identity rule the way a domain allowlist would be. */
  hasEspSignature?: boolean;
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
  /no.?reply|do.?not.?reply|notification|alert|update|mailer.?daemon/i;

// Subject-line shapes that are content-generic (apply to any sender, not
// a specific company) and essentially never warrant a reply.
const MARKETING_SUBJECT =
  /\b(sale|discount|limited offer|promotion|black friday|coupon)\b/i;
const OTP_SUBJECT =
  /\b(otp|verification code|security code|login code|authentication code|one-time password)\b/i;
const PASSWORD_RESET_SUBJECT =
  /\breset (your )?password\b|\bpassword (has been )?changed\b|\bforgot password\b/i;
const BILLING_SUBJECT =
  /\binvoice\b|\breceipt\b|\bpayment (successful|received)\b|\bsubscription (renewed|confirmation)\b|\brefund (processed|issued)\b|\border confirmation\b/i;
const SHIPPING_SUBJECT =
  /\byour order (has )?shipped\b|\bout for delivery\b|\bpackage delivered\b|\btracking number\b/i;
const CALENDAR_SUBJECT =
  /\bmeeting invitation\b|\bcalendar (update|invite)\b|\baccepted the invitation\b|\bdeclined the invitation\b/i;

const BULK_SUBJECT_PATTERNS = [
  MARKETING_SUBJECT,
  OTP_SUBJECT,
  PASSWORD_RESET_SUBJECT,
  BILLING_SUBJECT,
  SHIPPING_SUBJECT,
  CALENDAR_SUBJECT,
];

/**
 * True for addresses that are structurally incapable of reading a reply
 * (noreply/donotreply/alert-style inboxes). Used both to flag a message as
 * bulk mail at sync time, and as an independent guard right before
 * drafting or auto-sending a reply — so even a message that slipped past
 * the sync-time filter (e.g. classified some other way) can never get a
 * reply addressed into a black hole.
 */
export function isAutomatedAddress(address?: string): boolean {
  const localPart = address?.split('@')[0];
  return !!localPart && AUTOMATED_SENDER_LOCAL_PART.test(localPart);
}

/**
 * Every legitimate newsletter, social notification, and automated /
 * transactional sender sets one of these headers — it's a deliverability
 * convention (RFC 2919, RFC 3834, and Gmail/Outlook's own bulk-sender
 * requirements), not a provider-specific label. Checking headers directly
 * means this works identically for Gmail, Outlook, and IMAP, unlike
 * Gmail's own `category:` search operator.
 *
 * Subject-line and sender-address checks are content-shape rules, not
 * company-identity rules — deliberately no hardcoded vendor/domain
 * allowlists (e.g. "amazon.com"), which would need a new entry for every
 * sender that ever exists.
 */
export function isBulkMail(
  headers: BulkMailHeaders,
  senderAddress?: string,
  subject?: string,
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

  if (
    headers.autoResponseSuppress ||
    headers.feedbackId ||
    headers.hasEspSignature
  ) {
    return true;
  }

  if (
    subject &&
    BULK_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject))
  ) {
    return true;
  }

  return isAutomatedAddress(senderAddress);
}
