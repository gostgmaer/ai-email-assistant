import { decideTriage, TriageMessage } from './triage.util';

describe('decideTriage', () => {
  const own = ['me@work.io'];
  const me = [{ name: 'Me', address: 'me@work.io' }];
  const sam = [{ name: 'Sam', address: 'sam@client.io' }];

  function message(overrides: Partial<TriageMessage> = {}): TriageMessage {
    return {
      from: sam,
      to: me,
      bodyText: 'Here is the report you asked for.',
      ...overrides,
    };
  }

  it('is FYI when the user sent the newest message', () => {
    expect(
      decideTriage(
        message({ from: me, to: sam, needsReply: true, bodyText: 'Any news?' }),
        own,
      ),
    ).toBe('FYI');
  });

  it('matches an alias case-insensitively as the user', () => {
    expect(
      decideTriage(message({ from: [{ address: 'Sales@Work.io' }] }), [
        'me@work.io',
        'sales@work.io',
      ]),
    ).toBe('FYI');
  });

  it.each(['NEWSLETTER', 'NOTIFICATION'] as const)(
    'uses the sync-time bulk kind %s',
    (bulkKind) => {
      expect(decideTriage(message({ bulkKind, needsReply: true }), own)).toBe(
        bulkKind,
      );
    },
  );

  it('is a notification for a bounce, even though it is an auto-reply', () => {
    expect(
      decideTriage(
        message({
          from: [{ address: 'mailer-daemon@googlemail.com' }],
          isAutoReply: true,
        }),
        own,
      ),
    ).toBe('NOTIFICATION');
  });

  it('is FYI for an automatic reply', () => {
    expect(decideTriage(message({ isAutoReply: true }), own)).toBe('FYI');
  });

  it('puts mail the classifier called Marketing under Newsletters', () => {
    expect(
      decideTriage(message({ category: 'Marketing', needsReply: false }), own),
    ).toBe('NEWSLETTER');
  });

  it('follows the AI pipeline when it decided needsReply', () => {
    expect(decideTriage(message({ needsReply: true }), own)).toBe(
      'NEEDS_REPLY',
    );
    expect(
      decideTriage(message({ needsReply: false, bodyText: 'Can you?' }), own),
    ).toBe('FYI');
  });

  describe('mail the AI pipeline never saw', () => {
    it('is a notification from a noreply-style sender', () => {
      expect(
        decideTriage(
          message({
            from: [{ address: 'no-reply@portal.gov' }],
            bodyText: 'Did you request this?',
          }),
          own,
        ),
      ).toBe('NOTIFICATION');
    });

    it('needs a reply when it asks the user a question', () => {
      expect(
        decideTriage(message({ bodyText: 'Can we meet on Friday?' }), own),
      ).toBe('NEEDS_REPLY');
    });

    it('ignores questions in the quoted history', () => {
      expect(
        decideTriage(
          message({
            bodyText:
              'Done, attached.\n\nOn Mon, Sam wrote:\n> Can you send it?',
          }),
          own,
        ),
      ).toBe('FYI');
    });

    it('reads the HTML body when there is no text body', () => {
      expect(
        decideTriage(
          message({
            bodyText: null,
            bodyHtml: '<p>Are you free <b>Friday</b>?</p>',
          }),
          own,
        ),
      ).toBe('NEEDS_REPLY');
    });

    it('is FYI when the user was only copied', () => {
      expect(
        decideTriage(
          message({ to: sam, cc: me, bodyText: 'Can we meet Friday?' }),
          own,
        ),
      ).toBe('FYI');
    });

    it('ignores the "?" in links, as in a calendar invitation', () => {
      expect(
        decideTriage(
          message({
            bodyText:
              'Invitation: Interview\nJoin: https://meet.example.com/abc?pli=1\nReply: https://calendar.example.com/r?eid=x',
          }),
          own,
        ),
      ).toBe('FYI');
    });

    it('is FYI for a plain statement', () => {
      expect(decideTriage(message(), own)).toBe('FYI');
    });
  });
});
