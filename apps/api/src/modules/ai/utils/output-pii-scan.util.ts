// SSN: the one pattern with essentially no legitimate reason to appear in
// an email reply.
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;

// Loose 13-19 digit sequence (optionally grouped by spaces/dashes), the
// shape of a card/bank account number. Deliberately not Luhn-validated —
// this is a cheap safety net, not a PCI compliance tool. A false positive
// just means a real reply gets held for review instead of auto-sent,
// which is the safe direction to err in.
const ACCOUNT_NUMBER_PATTERN = /\b(?:\d[ -]?){13,19}\b/;

export interface OutputPiiScanResult {
  detected: boolean;
  types: string[];
}

/**
 * Deterministic, regex-only scan of an AI-GENERATED reply's text, run
 * before it's allowed to auto-send. Deliberately narrow — unlike the
 * input-side classification (EmailMessage.containsPii/piiTypes, which
 * uses LLM judgment and explicitly treats a signature's phone/email as
 * NOT PII), this only catches categories that are essentially never
 * legitimate in reply body text, so it doesn't false-positive on every
 * ordinary email signature. Exists because an LLM can produce a
 * plausible-looking SSN/account number that was never actually in the
 * thread — the input-side check alone doesn't catch that.
 */
export function scanOutputForPii(text: string): OutputPiiScanResult {
  const types: string[] = [];

  if (SSN_PATTERN.test(text)) {
    types.push('SSN');
  }
  if (ACCOUNT_NUMBER_PATTERN.test(text)) {
    types.push('card or account number');
  }

  return { detected: types.length > 0, types };
}
