import { InboxService } from './inbox.service';

describe('InboxService — smart triage', () => {
  function build(
    threads: {
      id: string;
      accountId: string;
      messages: { id: string; providerMessageId: string }[];
    }[] = [],
    client: { archiveMessage?: jest.Mock } = {
      archiveMessage: jest.fn().mockResolvedValue(undefined),
    },
  ) {
    const prisma = {
      emailThread: {
        findMany: jest.fn().mockResolvedValue(
          threads.map((thread) => ({
            ...thread,
            account: { id: thread.accountId },
            folder: { providerFolderId: 'INBOX' },
          })),
        ),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      emailMessage: { update: jest.fn() },
      mailFolder: {
        findFirst: jest.fn().mockResolvedValue({ id: 'archive-folder' }),
        create: jest.fn(),
      },
    };
    const mailProviderFactory = {
      createClient: jest.fn().mockResolvedValue(client),
    };
    const service = new InboxService(
      prisma as never,
      mailProviderFactory as never,
      {} as never,
      {} as never,
    );
    return { service, prisma, client };
  }

  it('filters the thread list by triage group', async () => {
    const { service, prisma } = build();

    await service.listThreads('user-1', { triage: 'NEEDS_REPLY' });

    const [[args]] = prisma.emailThread.findMany.mock.calls as [
      [{ where: { AND: unknown[] } }],
    ];
    expect(args.where.AND).toContainEqual({ triage: 'NEEDS_REPLY' });
  });

  it('counts inbox threads per group, untriaged ones only in all', async () => {
    const { service, prisma } = build();
    prisma.emailThread.groupBy.mockResolvedValue([
      { triage: 'NEEDS_REPLY', _count: { _all: 3 } },
      { triage: 'NEWSLETTER', _count: { _all: 5 } },
      { triage: null, _count: { _all: 2 } },
    ]);

    await expect(service.getTriageCounts('user-1')).resolves.toEqual({
      all: 10,
      NEEDS_REPLY: 3,
      FYI: 0,
      NOTIFICATION: 0,
      NEWSLETTER: 5,
    });
  });

  it('previews only old inbox newsletters on the user’s accounts', async () => {
    const { service, prisma } = build();
    prisma.emailThread.count.mockResolvedValue(7);

    await expect(
      service.previewNewsletterCleanup('user-1', 30),
    ).resolves.toEqual({ count: 7 });

    const [[{ where }]] = prisma.emailThread.count.mock.calls as [
      [{ where: Record<string, unknown> }],
    ];
    expect(where).toMatchObject({
      triage: 'NEWSLETTER',
      folder: { type: 'INBOX' },
      account: { members: { some: { userId: 'user-1' } }, deletedAt: null },
    });
    const cutoff = (where.lastMessageAt as { lt: Date }).lt.getTime();
    expect(Math.abs(cutoff - (Date.now() - 30 * 86_400_000))).toBeLessThan(
      5_000,
    );
  });

  it('archives every message at the provider, then files the thread under Archive', async () => {
    const { service, prisma, client } = build([
      {
        id: 'thread-1',
        accountId: 'account-1',
        messages: [
          { id: 'm1', providerMessageId: 'p1' },
          { id: 'm2', providerMessageId: 'p2' },
        ],
      },
    ]);

    await expect(service.cleanupNewsletters('user-1', 30)).resolves.toEqual({
      archived: 1,
      failed: 0,
      remaining: 0,
    });
    expect(client.archiveMessage).toHaveBeenCalledWith('p1', 'INBOX');
    expect(client.archiveMessage).toHaveBeenCalledWith('p2', 'INBOX');
    expect(prisma.emailThread.update).toHaveBeenCalledWith({
      where: { id: 'thread-1' },
      data: { folderId: 'archive-folder' },
    });
  });

  it('leaves a thread in the inbox when the provider fails', async () => {
    const { service, prisma } = build(
      [
        {
          id: 'thread-1',
          accountId: 'account-1',
          messages: [{ id: 'm1', providerMessageId: 'p1' }],
        },
      ],
      { archiveMessage: jest.fn().mockRejectedValue(new Error('403')) },
    );

    await expect(service.cleanupNewsletters('user-1', 30)).resolves.toEqual({
      archived: 0,
      failed: 1,
      remaining: 0,
    });
    expect(prisma.emailThread.update).not.toHaveBeenCalled();
  });

  it('follows a provider that re-keys archived messages', async () => {
    const { service, prisma } = build(
      [
        {
          id: 'thread-1',
          accountId: 'account-1',
          messages: [{ id: 'm1', providerMessageId: 'p1' }],
        },
      ],
      { archiveMessage: jest.fn().mockResolvedValue('p1-new') },
    );

    await service.cleanupNewsletters('user-1', 30);

    expect(prisma.emailMessage.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { providerMessageId: 'p1-new' },
    });
  });
});
