import {
  MAX_MESSAGE_CHARS,
  MAX_THREAD_CHARS,
  MAX_THREAD_MESSAGES,
  buildThreadContext,
  stripQuotedHistory,
} from './thread-context.util';

describe('stripQuotedHistory', () => {
  it('drops everything from a Gmail-style "On … wrote:" header', () => {
    const body = [
      'Sounds good, Thursday it is.',
      '',
      'On Tue, 3 Oct 2026 at 10:00, Sam <sam@example.com> wrote:',
      '> Can we move to Thursday?',
      '> Thanks',
    ].join('\n');

    expect(stripQuotedHistory(body)).toBe('Sounds good, Thursday it is.');
  });

  it('handles a header wrapped onto two lines', () => {
    const body =
      'Yes.\n\nOn Tue, 3 Oct 2026 at 10:00, Sam <sam@example.com>\nwrote:\n> old';

    expect(stripQuotedHistory(body)).toBe('Yes.');
  });

  it('drops an Outlook From:/Sent: block and Original Message separators', () => {
    expect(
      stripQuotedHistory(
        'Approved.\r\n\r\nFrom: Sam <sam@example.com>\r\nSent: Tuesday\r\nSubject: PO\r\n\r\nold body',
      ),
    ).toBe('Approved.');
    expect(
      stripQuotedHistory('Done.\n-----Original Message-----\nold body'),
    ).toBe('Done.');
  });

  it('keeps a body that is nothing but a quote', () => {
    expect(stripQuotedHistory('> only quoted')).toBe('> only quoted');
  });

  it('does not cut a sentence that merely starts with "On"', () => {
    const body = 'On Monday we ship the fix.\nThanks!';
    expect(stripQuotedHistory(body)).toBe(body);
  });
});

describe('buildThreadContext', () => {
  const msg = (content: string) => ({
    name: 'Sam',
    email: 'sam@example.com',
    content,
  });

  it('caps a single huge message', () => {
    const [only] = buildThreadContext([msg('x'.repeat(50_000))]);

    expect(only.content.length).toBe(MAX_MESSAGE_CHARS);
    expect(only.content.endsWith('[…truncated]')).toBe(true);
  });

  it('keeps the first and latest messages and drops the oldest middle ones when over budget', () => {
    const thread = Array.from({ length: 20 }, (_, i) =>
      msg(`message ${i} ` + 'y'.repeat(3_000)),
    );

    const result = buildThreadContext(thread);
    const total = result.reduce((sum, m) => sum + m.content.length, 0);

    expect(result[0].content.startsWith('message 0 ')).toBe(true);
    expect(result[result.length - 1].content.startsWith('message 19 ')).toBe(
      true,
    );
    expect(result.length).toBeLessThanOrEqual(MAX_THREAD_MESSAGES);
    expect(total).toBeLessThanOrEqual(MAX_THREAD_CHARS);
    // The middle that survives is the most recent part.
    expect(result[result.length - 2].content.startsWith('message 18 ')).toBe(
      true,
    );
  });

  it('leaves a short thread untouched apart from quote stripping', () => {
    const result = buildThreadContext([
      msg('Hi'),
      msg('Hello back\n\nOn Mon, Sam wrote:\n> Hi'),
    ]);

    expect(result.map((m) => m.content)).toEqual(['Hi', 'Hello back']);
  });
});
