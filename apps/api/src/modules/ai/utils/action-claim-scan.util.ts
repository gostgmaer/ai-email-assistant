export interface ActionClaimScanResult {
  detected: boolean;
  // One human-readable entry per offending sentence — the same shape as
  // validate_reply's unsupportedClaims, so both can be shown on a held
  // draft's card together.
  claims: string[];
}

// Verbs that report a task as finished. The AI can't do any of these on
// the user's behalf (it can't pay, upload, sign or attach anything), so a
// reply saying the user already did one is invented unless a human checks.
const DONE_VERBS =
  'completed|finished|submitted|uploaded|paid|sent|signed|reset|reviewed|' +
  'transferred|processed|filed|forwarded|shared|fixed|approved|wired|' +
  'deposited|returned|cancell?ed|refunded|resolved|delivered|shipped|' +
  'installed|deployed|merged|booked|updated|changed|settled|renewed';

const CLAIM_PATTERNS: RegExp[] = [
  // "Please find the NDA attached", "see attached"
  /\b(?:find|see)\b[^.!?\n]{0,60}\b(?:attached|enclosed)\b/i,
  // "Attached is…", "Enclosed are…", "Attached: invoice.pdf"
  /(?:^|[.!?]\s*)(?:attached|enclosed)\b/i,
  /\b(?:attached|enclosed)\s+(?:is|are|you(?:'ll| will) find)\b/i,
  // "I've attached", "I am attaching", "we have enclosed"
  /\b(?:I|we)(?:'ve|\s+have)?\s+(?:also\s+|just\s+)?(?:attached|enclosed|included)\b/i,
  /\b(?:I'm|I am|we're|we are)\s+(?:also\s+)?(?:attaching|enclosing)\b/i,
  // "I have completed the assessment", "we just sent it"
  new RegExp(
    `\\b(?:I|we)(?:'ve|\\s+have|\\s+had)?\\s+(?:already\\s+|just\\s+|now\\s+|also\\s+)?(?:${DONE_VERBS})\\b`,
    'i',
  ),
  // "The password has been reset", "payments have now been made"
  new RegExp(
    `\\b(?:has|have)\\s+(?:now\\s+|already\\s+|just\\s+|also\\s+)?been\\s+(?:${DONE_VERBS}|made|done)\\b`,
    'i',
  ),
  // "Payment was made this morning"
  /\b(?:was|were)\s+(?:just\s+|already\s+|successfully\s+)?(?:paid|submitted|uploaded|sent|signed|transferred|processed|completed|made|reset|wired)\b/i,
];

// "Once it has been signed…", "after I've reviewed it…" describe a future
// step, not a finished one.
const CONDITIONAL_LEAD = /\b(?:once|after|when|if|until|as soon as|before)\b/i;

const MAX_QUOTE_CHARS = 120;

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function claimsDoneAction(sentence: string): boolean {
  // A question ("Have you submitted it?") asks, it doesn't claim.
  if (sentence.endsWith('?')) {
    return false;
  }
  return CLAIM_PATTERNS.some((pattern) => {
    const match = pattern.exec(sentence);
    return (
      match !== null && !CONDITIONAL_LEAD.test(sentence.slice(0, match.index))
    );
  });
}

/**
 * Deterministic check of an AI-GENERATED reply for sentences saying a task
 * is already done or a file is attached ("I've completed the assessment",
 * "Please find the NDA attached"). The model writes these when an email
 * asks for something, and the LLM validator tends to accept them because
 * the request itself is in the thread. Cheap and model-independent, so it
 * runs on every reply; a match holds the reply for review.
 */
export function scanOutputForActionClaims(text: string): ActionClaimScanResult {
  const claims = sentencesOf(text)
    .filter(claimsDoneAction)
    .map((sentence) => {
      const quote =
        sentence.length > MAX_QUOTE_CHARS
          ? `${sentence.slice(0, MAX_QUOTE_CHARS - 1)}…`
          : sentence;
      return `"${quote}" says something is already done or attached; nothing in the conversation shows that.`;
    });

  return { detected: claims.length > 0, claims };
}
