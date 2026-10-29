import { median, WritingStyleService } from './writing-style.service';

describe('WritingStyleService', () => {
  const accountId = 'account-1';
  const learned = {
    greeting: 'Hi {name},',
    signOff: 'Thanks,',
    formality: 'casual',
    length: 'short',
    language: 'English',
    commonPhrases: ['Happy to help'],
    notes: null,
  };

  function sent(
    body: string,
    to = [{ name: 'Sam Lee', address: 'sam@client.io' }],
  ) {
    return { bodyText: body, bodyHtml: null, to, cc: [] };
  }

  function buildDeps(
    options: {
      rows?: unknown[];
      profileRow?: unknown;
      accounts?: { id: string }[];
      aiError?: Error;
    } = {},
  ) {
    const prisma = {
      emailAccount: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          email: 'me@work.io',
          aliases: ['sales@work.io'],
          displayName: 'Work',
          user: { displayName: 'Kishor Sarkar', companyName: 'EasyDev' },
        }),
        findMany: jest.fn().mockResolvedValue(options.accounts ?? []),
      },
      writingStyleProfile: {
        findUnique: jest.fn().mockResolvedValue(options.profileRow ?? null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      aiDraftOutcome: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue(options.rows ?? []),
    };
    const aiClientService = {
      styleProfile: options.aiError
        ? jest.fn().mockRejectedValue(options.aiError)
        : jest.fn().mockResolvedValue({ profile: learned }),
    };
    const service = new WritingStyleService(
      prisma as never,
      aiClientService as never,
    );
    return { service, prisma, aiClientService };
  }

  const enough = Array.from({ length: 6 }, (_, n) =>
    sent(`Thanks for the update number ${n}, all good here.`),
  );

  it('builds nothing from too little sent mail', async () => {
    const { service, aiClientService, prisma } = buildDeps({
      rows: [...enough.slice(0, 4), sent('ok'), sent('   ')],
    });

    await expect(service.build(accountId)).resolves.toEqual({
      status: 'not-enough-mail',
      sampleCount: 4,
    });
    expect(aiClientService.styleProfile).not.toHaveBeenCalled();
    expect(prisma.writingStyleProfile.upsert).not.toHaveBeenCalled();
  });

  it('learns from quote-stripped samples and passes every name to scrub', async () => {
    const { service, aiClientService } = buildDeps({
      rows: [
        sent('Sounds good, see you then.\n\nOn Mon, Sam wrote:\n> Lunch?'),
        ...enough,
      ],
    });

    await service.build(accountId);

    const [samples, names] = aiClientService.styleProfile.mock.calls[0] as [
      string[],
      string[],
    ];
    expect(samples[0]).toBe('Sounds good, see you then.');
    expect(samples).toHaveLength(7);
    expect(names).toEqual(
      expect.arrayContaining([
        'Sam Lee',
        'Work',
        'Kishor Sarkar',
        'EasyDev',
        'me',
      ]),
    );
    // A recipient's address is never used as a name.
    expect(names).not.toContain('sam');
  });

  it('stores the profile with the median length and clears hand edits', async () => {
    const { service, prisma } = buildDeps({ rows: enough });

    await expect(service.build(accountId)).resolves.toEqual({
      status: 'built',
      sampleCount: 6,
    });

    const call = prisma.writingStyleProfile.upsert.mock.calls[0] as [
      { update: Record<string, unknown> },
    ];
    expect(call[0].update).toEqual(
      expect.objectContaining({
        profile: { ...learned, medianWords: 9 },
        sampleCount: 6,
        editedAt: null,
      }),
    );
  });

  it('reads only the user’s own, human-written sent mail', async () => {
    const { service, prisma } = buildDeps({ rows: enough });

    await service.build(accountId);

    const [strings, ...values] = prisma.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = strings.join('?');
    expect(sql).toContain('"generationMetadata" IS NULL');
    expect(sql).toContain('"isAutoReply" = false');
    expect(sql).toContain("f.type <> 'DRAFTS'");
    expect(values).toContainEqual(['me@work.io', 'sales@work.io']);
  });

  it('gives replies no style when the user turned it off', async () => {
    const off = buildDeps({ profileRow: { profile: learned, enabled: false } });
    const on = buildDeps({ profileRow: { profile: learned, enabled: true } });

    await expect(off.service.forAccount(accountId)).resolves.toBeUndefined();
    await expect(on.service.forAccount(accountId)).resolves.toEqual(learned);
  });

  it('never fails a reply over the style lookup', async () => {
    const { service, prisma } = buildDeps();
    prisma.writingStyleProfile.findUnique.mockRejectedValue(new Error('db'));

    await expect(service.forAccountQuietly(accountId)).resolves.toBeUndefined();
  });

  it('refreshes only missing, stale, unedited and enabled profiles', async () => {
    const { service, prisma } = buildDeps({ rows: enough, accounts: [] });
    const now = new Date('2026-10-29T00:00:00Z');

    await service.refreshStale(now);

    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { writingStyleProfile: null },
            {
              writingStyleProfile: {
                enabled: true,
                editedAt: null,
                builtAt: { lt: new Date('2026-10-22T00:00:00Z') },
              },
            },
          ],
        },
      }),
    );
  });

  it('stops the refresh at the first AI failure', async () => {
    const { service, aiClientService } = buildDeps({
      rows: enough,
      accounts: [{ id: 'a' }, { id: 'b' }],
      aiError: new Error('429'),
    });

    await expect(service.refreshStale()).resolves.toBe(0);
    expect(aiClientService.styleProfile).toHaveBeenCalledTimes(1);
  });

  it('compares edits before and after the profile existed', async () => {
    const { service, prisma } = buildDeps();
    prisma.aiDraftOutcome.findMany
      .mockResolvedValueOnce([
        { editDistance: 0.4 },
        { editDistance: 0.6 },
        { editDistance: 0.2 },
      ])
      .mockResolvedValueOnce([{ editDistance: 0.1 }]);

    await expect(
      service.editStats(accountId, new Date('2026-10-29T00:00:00Z')),
    ).resolves.toEqual({
      before: { median: 0.4, count: 3 },
      after: { median: 0.1, count: 1 },
    });
  });
});

describe('median', () => {
  it('is the middle value, or the mean of the two middle ones', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});
