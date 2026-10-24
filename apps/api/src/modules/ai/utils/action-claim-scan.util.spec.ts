import { scanOutputForActionClaims } from './action-claim-scan.util';

describe('scanOutputForActionClaims', () => {
  // Real replies the model wrote, or the validator passed with
  // confidence 100, in the 23 Oct probe.
  it.each([
    'Thanks for the heads-up. I have completed the assessment as requested.',
    'Payment for $1,250 has just been processed via bank transfer.',
    'Attached is the signed NDA as requested.',
    'The password has been reset through the portal, and everything is back up and running.',
    'Thank you. The pre-screening assessment has been completed and submitted.',
    'Hi Priya, I have uploaded my ID proof and the signed offer letter to the portal.',
    'Hello, the payment of $1,250 was made this morning.',
    "Hi Rahul, I've reviewed PR #212 and left my comments.",
    'Please find the signed NDA attached.',
    'Attached is the file you requested for the S02 test case.',
    "I'm attaching the report now.",
    'We just sent the replacement unit.',
    'I have updated my password through the portal as requested.',
    'I have completed the assessment and submitted it through the link provided.',
  ])('flags %p', (reply) => {
    const result = scanOutputForActionClaims(reply);

    expect(result.detected).toBe(true);
    expect(result.claims).toHaveLength(1);
  });

  it.each([
    'Thanks for the reminder, Priya. I will get those documents uploaded to the portal by the end of the day today.',
    "Thanks for the heads-up, Rahul. I'll take a look at PR #212 this morning.",
    'Tuesday at 3pm works perfectly for me.',
    'Have you submitted the form yet?',
    'Once the NDA has been signed, I will send it back.',
    "I'll review the attached proposal and get back to you.",
    'Thanks for sending the attached invoice.',
    'I have not sent the payment yet, but will do so tomorrow.',
    'Confirmation received—this email came through successfully.',
  ])('does not flag %p', (reply) => {
    expect(scanOutputForActionClaims(reply).detected).toBe(false);
  });

  it('quotes each offending sentence once, in order', () => {
    const result = scanOutputForActionClaims(
      'Hi Sam,\n\nI have paid the invoice. Thanks for your patience.\nPlease see the receipt attached.',
    );

    expect(result.claims).toEqual([
      '"I have paid the invoice." says something is already done or attached; nothing in the conversation shows that.',
      '"Please see the receipt attached." says something is already done or attached; nothing in the conversation shows that.',
    ]);
  });

  it('shortens a long sentence in the quote', () => {
    const result = scanOutputForActionClaims(
      `I have submitted ${'the very long form '.repeat(10)}today.`,
    );

    expect(result.claims[0].startsWith('"I have submitted')).toBe(true);
    expect(result.claims[0]).toContain('…"');
  });
});
