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

/**
 * Per-category sync filters (matches EmailAccount's filter* columns).
 * true = exclude this category from sync by default. Header-based and
 * automated-sender detection are deliberately NOT here — they're always
 * on, not user-configurable, since toggling them off would readmit
 * obvious spam.
 */
export interface MailFilterSettings {
  filterMarketing: boolean;
  filterOtp: boolean;
  filterPasswordReset: boolean;
  filterBilling: boolean;
  filterShipping: boolean;
  filterCalendar: boolean;
}

export const DEFAULT_MAIL_FILTER_SETTINGS: MailFilterSettings = {
  filterMarketing: true,
  filterOtp: true,
  filterPasswordReset: true,
  filterBilling: true,
  filterShipping: true,
  filterCalendar: true,
};

/**
 * Every independently-detectable "does this email look like X" signal for
 * a message, computed once at normalize time from headers/sender/subject
 * — before any per-account settings are known (provider clients don't
 * have account context). The settings-aware decision happens in
 * isBulkMail() below.
 */
export interface BulkMailSignals {
  /** Header-based bulk-sender signals, ESP infrastructure signature, or an
   * automated-looking sender local-part. Not configurable. */
  automated: boolean;
  marketing: boolean;
  otp: boolean;
  passwordReset: boolean;
  billing: boolean;
  shipping: boolean;
  calendar: boolean;
}

// Real-world test against a live inbox showed many automated senders (job
// boards, government portals, security-alert systems) never set bulk-mail
// headers — they just use a conventional local-part instead. This is a
// weaker signal than the headers (a real person could conceivably be
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
  /\binvoice\b|\breceipt\b|\bpayment (successful|received)\b|\bsubscription (renewed|confirmation)\b|\brefund (processed|issued)\b|\border confirmation\b|\baccount statement\b|\bbank account\b/i;
const SHIPPING_SUBJECT =
  /\byour order (has )?shipped\b|\bout for delivery\b|\bpackage delivered\b|\btracking number\b/i;
const CALENDAR_SUBJECT =
  /\bmeeting invitation\b|\bcalendar (update|invite)\b|\baccepted the invitation\b|\bdeclined the invitation\b/i;

/**
 * True for addresses that are structurally incapable of reading a reply
 * (noreply/donotreply/alert-style inboxes). Used both as part of
 * detectBulkMailSignals() at sync time, and as an independent guard right
 * before drafting or auto-sending a reply — so even a message that
 * slipped past the sync-time filter can never get a reply addressed into
 * a black hole.
 */
export function isAutomatedAddress(address?: string): boolean {
  const localPart = address?.split('@')[0];
  return !!localPart && AUTOMATED_SENDER_LOCAL_PART.test(localPart);
}

/**
 * Computes every bulk-mail signal for a message. Provider-agnostic and
 * settings-agnostic — the same signals are always detected; whether they
 * result in exclusion is decided later, per-account, by isBulkMail().
 */
export function detectBulkMailSignals(
  headers: BulkMailHeaders,
  senderAddress?: string,
  subject?: string,
): BulkMailSignals {
  const automated =
    !!(headers.listUnsubscribe || headers.listId) ||
    !!(
      headers.precedence && /\b(bulk|list|junk)\b/i.test(headers.precedence)
    ) ||
    !!(headers.autoSubmitted && !/^no$/i.test(headers.autoSubmitted.trim())) ||
    !!headers.autoResponseSuppress ||
    !!headers.feedbackId ||
    !!headers.hasEspSignature ||
    isAutomatedAddress(senderAddress);

  return {
    automated,
    marketing: !!subject && MARKETING_SUBJECT.test(subject),
    otp: !!subject && OTP_SUBJECT.test(subject),
    passwordReset: !!subject && PASSWORD_RESET_SUBJECT.test(subject),
    billing: !!subject && BILLING_SUBJECT.test(subject),
    shipping: !!subject && SHIPPING_SUBJECT.test(subject),
    calendar: !!subject && CALENDAR_SUBJECT.test(subject),
  };
}

/**
 * The settings-aware exclusion decision. Header/sender-based detection
 * (signals.automated) always excludes — deliberately not configurable.
 * Subject-shape categories only exclude if their matching filter* setting
 * is on (the default).
 *
 * Deliberately no hardcoded vendor/domain allowlists (e.g. "amazon.com"),
 * which would need a new entry for every sender that ever exists.
 */
export function isBulkMail(
  signals: BulkMailSignals,
  settings: MailFilterSettings = DEFAULT_MAIL_FILTER_SETTINGS,
): boolean {
  if (signals.automated) {
    return true;
  }

  return (
    (settings.filterMarketing && signals.marketing) ||
    (settings.filterOtp && signals.otp) ||
    (settings.filterPasswordReset && signals.passwordReset) ||
    (settings.filterBilling && signals.billing) ||
    (settings.filterShipping && signals.shipping) ||
    (settings.filterCalendar && signals.calendar)
  );
}
