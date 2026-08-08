import { scanOutputForPolicyViolations } from './output-policy-scan.util';

describe('scanOutputForPolicyViolations', () => {
  it('is a no-op when there are no prohibited phrases configured', () => {
    const result = scanOutputForPolicyViolations(
      'Sure, I can offer you a full refund and a discount.',
      [],
    );

    expect(result.violated).toBe(false);
    expect(result.matchedPhrases).toEqual([]);
  });

  it('flags a case-insensitive substring match', () => {
    const result = scanOutputForPolicyViolations(
      'Sure, I can offer you a full Refund right away.',
      ['refund'],
    );

    expect(result.violated).toBe(true);
    expect(result.matchedPhrases).toEqual(['refund']);
  });

  it('collects every matched phrase, not just the first', () => {
    const result = scanOutputForPolicyViolations(
      'I can offer a discount and a full refund.',
      ['discount', 'refund', 'guarantee'],
    );

    expect(result.matchedPhrases).toEqual(['discount', 'refund']);
  });

  it('does not flag unrelated text', () => {
    const result = scanOutputForPolicyViolations(
      'Confirmed for Monday at 3pm.',
      ['refund', 'discount'],
    );

    expect(result.violated).toBe(false);
  });
});
