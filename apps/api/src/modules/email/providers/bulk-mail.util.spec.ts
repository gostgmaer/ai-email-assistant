import {
  bulkKindOf,
  DEFAULT_MAIL_FILTER_SETTINGS,
  detectBulkMailSignals,
} from './bulk-mail.util';

describe('detectBulkMailSignals — autoReply', () => {
  const human = 'casey@example.com';

  it('is false for an ordinary human email', () => {
    const signals = detectBulkMailSignals({}, human, 'Re: order question');

    expect(signals.autoReply).toBe(false);
    expect(signals.automated).toBe(false);
  });

  it.each([
    ['Auto-Submitted: auto-replied', { autoSubmitted: 'auto-replied' }],
    ['X-Autoreply', { xAutoreply: 'yes' }],
    ['X-Autorespond', { xAutorespond: 'vacation' }],
    ['Precedence: auto_reply', { precedence: 'auto_reply' }],
    ['an empty Return-Path (bounce)', { returnPath: '<>' }],
  ])('detects %s, and treats it as automated', (_label, headers) => {
    const signals = detectBulkMailSignals(headers, human, 'Re: hello');

    expect(signals.autoReply).toBe(true);
    expect(signals.automated).toBe(true);
  });

  it('ignores Auto-Submitted: no', () => {
    expect(
      detectBulkMailSignals({ autoSubmitted: 'no' }, human, 'Hi').autoReply,
    ).toBe(false);
  });

  it.each([
    'Automatic reply: Order question',
    'Out of Office: back Monday',
    'Auto-Reply: we got your message',
    'OOO until the 12th',
    'Réponse automatique : absent',
  ])(
    'detects the out-of-office subject "%s" without making it a sync filter',
    (subject) => {
      const signals = detectBulkMailSignals({}, human, subject);

      expect(signals.autoReply).toBe(true);
      // Subject shape alone isn't strong enough to drop mail at sync time.
      expect(signals.automated).toBe(false);
    },
  );

  it('does not match a subject that merely mentions being out of office later on', () => {
    expect(
      detectBulkMailSignals({}, human, "Before I'm out of office: the contract")
        .autoReply,
    ).toBe(false);
  });

  it.each(['mailer-daemon@example.com', 'postmaster@example.com'])(
    'detects the bounce sender %s',
    (sender) => {
      expect(detectBulkMailSignals({}, sender, 'Undeliverable').autoReply).toBe(
        true,
      );
    },
  );
});

describe('bulkKindOf', () => {
  const human = 'sam@client.io';

  it('is a newsletter for mailing-list mail', () => {
    const signals = detectBulkMailSignals(
      { listUnsubscribe: '<https://x.example/u>' },
      'news@brand.example',
      'This week',
    );
    expect(signals.mailingList).toBe(true);
    expect(bulkKindOf(signals)).toBe('NEWSLETTER');
  });

  it('is a newsletter for marketing subjects', () => {
    expect(
      bulkKindOf(detectBulkMailSignals({}, human, 'Black Friday sale')),
    ).toBe('NEWSLETTER');
  });

  it('is a notification for other automated mail', () => {
    expect(
      bulkKindOf(
        detectBulkMailSignals({}, 'no-reply@bank.example', 'Statement ready'),
      ),
    ).toBe('NOTIFICATION');
    expect(
      bulkKindOf(detectBulkMailSignals({}, human, 'Your OTP is 1234')),
    ).toBe('NOTIFICATION');
  });

  it('is null for normal mail, and when the category filter is off', () => {
    expect(bulkKindOf(detectBulkMailSignals({}, human, 'Hello'))).toBeNull();
    expect(
      bulkKindOf(detectBulkMailSignals({}, human, 'Big sale'), {
        ...DEFAULT_MAIL_FILTER_SETTINGS,
        filterMarketing: false,
      }),
    ).toBeNull();
  });
});
