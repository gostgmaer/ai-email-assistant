import { textToSafeHtml } from '../../email/utils/text-to-html.util';
import { scheduleAutoSend } from './send-schedule.util';
import { hasSignature, htmlToPlainText, withSignature } from './signature.util';

describe('withSignature', () => {
  it('leaves the reply alone when there is no signature', () => {
    expect(
      withSignature('Thanks!', { signatureText: null, signatureHtml: null }),
    ).toEqual({ text: 'Thanks!', html: textToSafeHtml('Thanks!') });
    expect(hasSignature({ signatureText: '', signatureHtml: null })).toBe(
      false,
    );
  });

  it('appends the text signature to both parts, escaping it for HTML', () => {
    const signed = withSignature('Thanks!\n', {
      signatureText: 'Alex Kim\nAcme <Sales>',
      signatureHtml: null,
    });

    expect(signed.text).toBe('Thanks!\n\nAlex Kim\nAcme <Sales>');
    expect(signed.html).toContain('Acme &lt;Sales&gt;');
  });

  it('uses the HTML signature for the HTML part and derives text from it', () => {
    const signed = withSignature('Thanks!', {
      signatureText: null,
      signatureHtml: '<div><b>Alex Kim</b><br>Acme &amp; Co</div>',
    });

    expect(signed.html).toContain('<b>Alex Kim</b>');
    expect(signed.text).toBe('Thanks!\n\nAlex Kim\nAcme & Co');
  });

  it('turns signature HTML into plain lines', () => {
    expect(
      htmlToPlainText('<p>Alex</p><p>Head of Sales</p><script>x()</script>'),
    ).toBe('Alex\nHead of Sales');
  });
});

describe('scheduleAutoSend', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const base = {
    undoSendSeconds: 0,
    quietHours: { start: null, end: null },
    timezone: 'UTC',
  };

  it('sends now when there is no undo window, delay or quiet hours', () => {
    expect(scheduleAutoSend(now, base)).toBeNull();
  });

  it('waits for the longer of the undo window and DELAY_SEND', () => {
    expect(scheduleAutoSend(now, { ...base, undoSendSeconds: 30 })).toEqual(
      new Date('2026-10-20T12:00:30Z'),
    );
    expect(
      scheduleAutoSend(now, {
        ...base,
        undoSendSeconds: 30,
        delaySendMinutes: 10,
      }),
    ).toEqual(new Date('2026-10-20T12:10:00Z'));
  });

  it('pushes a send that lands in quiet hours to their end', () => {
    expect(
      scheduleAutoSend(new Date('2026-10-20T21:50:00Z'), {
        ...base,
        delaySendMinutes: 20,
        quietHours: { start: '22:00', end: '07:00' },
      }),
    ).toEqual(new Date('2026-10-21T07:00:00Z'));
  });
});
