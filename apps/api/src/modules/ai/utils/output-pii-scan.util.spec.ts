import { scanOutputForPii } from './output-pii-scan.util';

describe('scanOutputForPii', () => {
  it('flags an SSN-shaped sequence', () => {
    const result = scanOutputForPii(
      'For reference, your SSN on file is 123-45-6789.',
    );

    expect(result.detected).toBe(true);
    expect(result.types).toContain('SSN');
  });

  it('flags a card/account-number-shaped sequence', () => {
    const result = scanOutputForPii(
      'Your card ending in 4242 4242 4242 4242 was charged.',
    );

    expect(result.detected).toBe(true);
    expect(result.types).toContain('card or account number');
  });

  it('does not flag an ordinary reply with a signature phone number', () => {
    const result = scanOutputForPii(
      'Thanks for reaching out — happy to help. Call me at 555-123-4567 if easier.\n\nBest,\nJordan',
    );

    expect(result.detected).toBe(false);
    expect(result.types).toEqual([]);
  });

  it('does not flag ordinary prose with no PII-shaped sequences', () => {
    const result = scanOutputForPii(
      'Confirmed for Monday at 3pm. See you then!',
    );

    expect(result.detected).toBe(false);
  });
});
