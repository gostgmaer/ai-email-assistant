import { AskService, NOTHING_FOUND_ANSWER } from './ask.service';

describe('AskService', () => {
  function hit(id: string, content = `Subject: S\nFrom: x\n\nBody ${id}`) {
    return {
      chunkId: `chunk-${id}`,
      messageId: `msg-${id}`,
      threadId: `thread-${id}`,
      subject: `Subject ${id}`,
      from: [{ name: 'Sam Lee', address: 'sam@client.io' }],
      receivedAt: new Date('2026-10-20T09:00:00Z'),
      content,
      score: 0.03,
    };
  }

  function build({
    hits = [hit('a'), hit('b'), hit('c')],
    answer = {
      answer: 'Friday [2].',
      citations: [2],
      found: true,
    },
    timezone = 'Asia/Kolkata',
  } = {}) {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ timezone }) },
    };
    const emailSearchService = { search: jest.fn().mockResolvedValue(hits) };
    const aiClientService = {
      answer: jest.fn().mockResolvedValue({
        ...answer,
        provider: 'google',
        model: 'm',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }),
    };
    const service = new AskService(
      prisma as never,
      emailSearchService as never,
      aiClientService as never,
    );
    return { service, emailSearchService, aiClientService };
  }

  it('answers with only the emails it cites, renumbered from 1', async () => {
    const { service } = build();

    const result = await service.ask('user-1', 'When is the meeting?');

    expect(result.answer).toBe('Friday [1].');
    expect(result.found).toBe(true);
    expect(result.sources).toEqual([
      {
        n: 1,
        messageId: 'msg-b',
        threadId: 'thread-b',
        subject: 'Subject b',
        from: [{ name: 'Sam Lee', address: 'sam@client.io' }],
        receivedAt: new Date('2026-10-20T09:00:00Z'),
        excerpt: 'Body b',
      },
    ]);
  });

  it('numbers the search hits and sends them with sender and date', async () => {
    const { service, aiClientService } = build();

    await service.ask('user-1', 'When?');

    const [[question, , sources]] = aiClientService.answer.mock.calls as [
      [string, string, { n: number; sender: string; date: string }[]],
    ];
    expect(question).toBe('When?');
    expect(sources.map((source) => source.n)).toEqual([1, 2, 3]);
    expect(sources[0]).toMatchObject({
      sender: 'Sam Lee <sam@client.io>',
      date: '2026-10-20',
    });
  });

  it("passes today's date in the user's own time zone", async () => {
    const { service, aiClientService } = build({
      timezone: 'Pacific/Kiritimati',
    });

    await service.ask('user-1', 'When?');

    const [[, today]] = aiClientService.answer.mock.calls as [[string, string]];
    expect(today).toBe(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Pacific/Kiritimati',
      }).format(new Date()),
    );
  });

  it('falls back to UTC for an unknown time zone', async () => {
    const { service, aiClientService } = build({ timezone: 'Not/AZone' });

    await service.ask('user-1', 'When?');

    const [[, today]] = aiClientService.answer.mock.calls as [[string, string]];
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('says nothing was found without calling the AI when search finds nothing', async () => {
    const { service, aiClientService } = build({ hits: [] });

    await expect(service.ask('user-1', 'When?')).resolves.toEqual({
      answer: NOTHING_FOUND_ANSWER,
      found: false,
      sources: [],
    });
    expect(aiClientService.answer).not.toHaveBeenCalled();
  });

  it('ignores a citation of an email the search did not return', async () => {
    const { service } = build({
      answer: { answer: 'Friday [9].', citations: [9], found: true },
    });

    const result = await service.ask('user-1', 'When?');

    expect(result.found).toBe(false);
    expect(result.sources).toEqual([]);
  });

  it('returns no sources when the AI found no answer', async () => {
    const { service } = build({
      answer: {
        answer: "I couldn't find that.",
        citations: [],
        found: false,
      },
    });

    const result = await service.ask('user-1', 'When?');

    expect(result).toEqual({
      answer: "I couldn't find that.",
      found: false,
      sources: [],
    });
  });

  it('passes the filters through to the search', async () => {
    const { service, emailSearchService } = build();
    const filters = { accountId: 'account-1', after: new Date('2026-01-01') };

    await service.ask('user-1', 'When?', filters);

    expect(emailSearchService.search).toHaveBeenCalledWith(
      'user-1',
      'When?',
      filters,
    );
  });

  it('trims long excerpts and drops the index header', async () => {
    const { service } = build({
      hits: [hit('a', `Subject: S\nFrom: x\n\n${'word '.repeat(200)}`)],
      answer: { answer: 'Yes [1].', citations: [1], found: true },
    });

    const [source] = (await service.ask('user-1', 'Q?')).sources;

    expect(source.excerpt.startsWith('word word')).toBe(true);
    expect(source.excerpt.endsWith('…')).toBe(true);
    expect(source.excerpt.length).toBeLessThanOrEqual(281);
  });

  it('renumbers citations in order of first use and drops unknown ones', async () => {
    const { service } = build({
      answer: {
        answer: 'Moved [3] from Monday [1][3]; see also [9].',
        citations: [3, 1, 9],
        found: true,
      },
    });

    const result = await service.ask('user-1', 'When?');

    expect(result.answer).toBe('Moved [1] from Monday [2][1]; see also .');
    expect(
      result.sources.map((source) => [source.n, source.messageId]),
    ).toEqual([
      [1, 'msg-c'],
      [2, 'msg-a'],
    ]);
  });
});
