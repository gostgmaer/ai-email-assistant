import { classifySenderTrust, findVerbatimQuote } from './grounding-guard.util';

describe('classifySenderTrust', () => {
  it('treats the same organisation domain as internal', () => {
    expect(classifySenderTrust('pat@acme.io', ['support@acme.io'], false)).toBe(
      'INTERNAL',
    );
  });

  it('never treats a shared consumer domain as internal', () => {
    expect(
      classifySenderTrust('stranger@gmail.com', ['me@gmail.com'], false),
    ).toBe('UNKNOWN');
  });

  it('marks prior correspondents as known', () => {
    expect(classifySenderTrust('casey@example.com', ['me@acme.io'], true)).toBe(
      'KNOWN',
    );
  });
});

describe('findVerbatimQuote', () => {
  const pricing =
    'Enterprise tier pricing: $42 per seat per month with a minimum of 200 seats, volume discount of 18% above 1,000 seats, and a confidential 30% partner rebate negotiated with Globex in Q3.';

  it('flags a reply that copies a long run of a document', () => {
    const reply = `Sure! Here are the details. ${pricing.slice(10, 170)} Let me know.`;

    expect(
      findVerbatimQuote(reply, [{ content: pricing, filename: 'pricing.pdf' }]),
    ).toBe('pricing.pdf');
  });

  it('is insensitive to whitespace and case changes in the copy', () => {
    const reply = pricing.toUpperCase().replace(/ /g, '\n  ');

    expect(
      findVerbatimQuote(reply, [{ content: pricing, filename: 'pricing.pdf' }]),
    ).toBe('pricing.pdf');
  });

  it('allows a paraphrase that only shares short phrases', () => {
    const reply =
      'Our enterprise tier is priced per seat, with volume discounts for larger teams. I can share a formal quote.';

    expect(
      findVerbatimQuote(reply, [{ content: pricing, filename: 'pricing.pdf' }]),
    ).toBeNull();
  });
});
