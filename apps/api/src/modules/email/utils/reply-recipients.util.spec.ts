import {
  buildReplyRecipients,
  buildThreadingHeaders,
  parseMessageIdList,
} from './reply-recipients.util';

describe('buildReplyRecipients', () => {
  const own = ['me@company.com', 'sales@company.com'];

  it('replies to Reply-To instead of From when it is set', () => {
    const { to, cc } = buildReplyRecipients(
      {
        from: [{ address: 'noreply-forms@vendor.com' }],
        replyTo: [{ address: 'customer@example.com', name: 'Casey' }],
        to: [{ address: 'me@company.com' }],
      },
      own,
    );

    expect(to).toEqual([{ address: 'customer@example.com', name: 'Casey' }]);
    expect(cc).toEqual([]);
  });

  it('reply-all copies the other participants and never the user themselves', () => {
    const { to, cc } = buildReplyRecipients(
      {
        from: [{ address: 'casey@example.com' }],
        to: [{ address: 'me@company.com' }, { address: 'pat@example.com' }],
        cc: [{ address: 'Sales@Company.com' }, { address: 'lee@example.com' }],
      },
      own,
      true,
    );

    expect(to).toEqual([{ address: 'casey@example.com' }]);
    expect(cc).toEqual([
      { address: 'pat@example.com' },
      { address: 'lee@example.com' },
    ]);
  });

  it("goes to the original recipients when replying to the user's own message", () => {
    const { to } = buildReplyRecipients(
      {
        from: [{ address: 'sales@company.com' }],
        to: [{ address: 'casey@example.com' }],
      },
      own,
    );

    expect(to).toEqual([{ address: 'casey@example.com' }]);
  });
});

describe('buildThreadingHeaders', () => {
  it("uses the parent's RFC Message-ID, not a provider id", () => {
    expect(
      buildThreadingHeaders({
        from: [],
        to: [],
        messageIdHeader: '<b@mail.example.com>',
        references: ['<a@mail.example.com>'],
      }),
    ).toEqual({
      inReplyToHeader: '<b@mail.example.com>',
      referencesHeader: ['<a@mail.example.com>', '<b@mail.example.com>'],
    });
  });

  it('returns nothing when the parent has no stored Message-ID', () => {
    expect(buildThreadingHeaders({ from: [], to: [] })).toEqual({});
  });
});

describe('parseMessageIdList', () => {
  it('extracts ids from a folded References header', () => {
    expect(parseMessageIdList('<a@x.com>\r\n <b@y.com>  <c@z.com>')).toEqual([
      '<a@x.com>',
      '<b@y.com>',
      '<c@z.com>',
    ]);
  });
});
