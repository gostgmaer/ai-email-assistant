export interface OutputPolicyScanResult {
  violated: boolean;
  matchedPhrases: string[];
}

/**
 * Case-insensitive substring check of an AI-GENERATED reply against the
 * account's own EmailAccount.prohibitedPhrases — empty by default (see
 * that field's schema comment for why this codebase doesn't pre-populate
 * any policy content). A no-op until an account owner configures phrases,
 * same as every other opt-in auto-send-adjacent setting here.
 */
export function scanOutputForPolicyViolations(
  text: string,
  prohibitedPhrases: string[],
): OutputPolicyScanResult {
  const lowerText = text.toLowerCase();
  const matchedPhrases = prohibitedPhrases.filter((phrase) =>
    lowerText.includes(phrase.toLowerCase()),
  );

  return { violated: matchedPhrases.length > 0, matchedPhrases };
}
