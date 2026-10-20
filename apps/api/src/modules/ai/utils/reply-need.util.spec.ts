import { findNoReplyReason } from './reply-need.util';

describe('findNoReplyReason', () => {
  const own = ['me@acme.io', 'sales@acme.io'];
  const toMe = { to: [{ address: 'me@acme.io' }] };

  it.each([
    'Thanks!',
    'Thank you so much!\nSam',
    'Got it, thanks',
    'Sounds good.',
    'Perfect, appreciate it!\n\nBest,\nSam',
    '👍',
  ])('treats "%s" as an acknowledgement', (text) => {
    expect(findNoReplyReason(toMe, text, own)).toBe('acknowledgement only');
  });

  it.each([
    'Thanks! Can you send the invoice?',
    'Thanks — one more thing: the shipment arrived damaged and we need a replacement by Friday.',
    'Got it. When does it ship?',
    'Can we meet Thursday?',
  ])('defers "%s" to the model', (text) => {
    expect(findNoReplyReason(toMe, text, own)).toBeNull();
  });

  it('skips mail the user is only copied on', () => {
    expect(
      findNoReplyReason(
        {
          to: [{ address: 'pat@example.com' }],
          cc: [{ address: 'Sales@Acme.io' }],
        },
        'Pat, please send the contract.',
        own,
      ),
    ).toBe('you were only copied (Cc)');
  });

  it('does not treat being in To and Cc as copied-only', () => {
    expect(
      findNoReplyReason(
        { to: [{ address: 'me@acme.io' }], cc: [{ address: 'sales@acme.io' }] },
        'Please send the contract.',
        own,
      ),
    ).toBeNull();
  });
});
