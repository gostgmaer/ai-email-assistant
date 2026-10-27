import { EmailIndexService } from './email-index.service';

describe('EmailIndexService', () => {
  function message(id: string, bodyText: string) {
    return {
      id,
      subject: `Subject ${id}`,
      from: [{ address: 'sam@client.io' }],
      to: [{ address: 'me@acme.io' }],
      receivedAt: new Date('2026-10-20T00:00:00Z'),
      bodyText,
      bodyHtml: null,
      thread: { accountId: 'account-1' },
    };
  }

  function build(env: Record<string, string> = {}) {
    const tx = {
      emailChunk: { deleteMany: jest.fn() },
      emailMessage: { updateMany: jest.fn() },
      $executeRaw: jest.fn(),
    };
    const prisma = {
      emailMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (t: typeof tx) => Promise<unknown>)(tx)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    const aiClientService = {
      embedBatch: jest.fn((texts: string[]) =>
        Promise.resolve({
          embeddings: texts.map(() => [0.1, 0.2]),
          provider: 'google',
          model: 'gemini-embedding-001',
        }),
      ),
    };
    const configService = { get: jest.fn((key: string) => env[key]) };

    const service = new EmailIndexService(
      prisma as never,
      aiClientService as never,
      configService as never,
    );
    return { service, prisma, tx, aiClientService };
  }

  it('returns 0 and embeds nothing when everything is indexed', async () => {
    const { service, aiClientService, prisma } = build();

    await expect(service.indexPending()).resolves.toBe(0);
    expect(aiClientService.embedBatch).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('only picks unindexed, recent mail outside spam, trash and drafts, newest first', async () => {
    const { service, prisma } = build({
      ASK_INDEX_DAYS: '30',
      SEARCH_INDEX_BATCH_SIZE: '25',
    });
    const before = Date.now();

    await service.indexPending();

    const [[args]] = prisma.emailMessage.findMany.mock.calls as [
      [
        {
          where: {
            searchIndexedAt: null;
            isSpam: boolean;
            receivedAt: { gte: Date };
            thread: unknown;
          };
          orderBy: unknown;
          take: number;
        },
      ],
    ];
    expect(args.where.searchIndexedAt).toBeNull();
    expect(args.where.isSpam).toBe(false);
    expect(args.where.thread).toEqual({
      folder: { type: { notIn: ['DRAFTS', 'SPAM', 'TRASH'] } },
      account: { deletedAt: null },
    });
    const ageMs = before - args.where.receivedAt.gte.getTime();
    expect(Math.round(ageMs / (24 * 60 * 60 * 1000))).toBe(30);
    expect(args.orderBy).toEqual({ receivedAt: 'desc' });
    expect(args.take).toBe(25);
  });

  it('embeds every chunk, replaces old chunks and marks the messages indexed in one transaction', async () => {
    const { service, prisma, tx, aiClientService } = build();
    prisma.emailMessage.findMany.mockResolvedValue([
      message('m1', 'First body'),
      message('m2', 'Second body'),
    ]);

    await expect(service.indexPending()).resolves.toBe(2);

    expect(aiClientService.embedBatch).toHaveBeenCalledTimes(1);
    const [[texts]] = aiClientService.embedBatch.mock.calls;
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain('First body');

    expect(tx.emailChunk.deleteMany).toHaveBeenCalledWith({
      where: { messageId: { in: ['m1', 'm2'] } },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.emailMessage.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m1', 'm2'] } },
      data: { searchIndexedAt: expect.any(Date) as Date },
    });
  });

  it('marks a message with nothing to index as done, without an insert', async () => {
    const { service, prisma, tx, aiClientService } = build();
    prisma.emailMessage.findMany.mockResolvedValue([
      { ...message('m1', ''), subject: null },
    ]);

    await expect(service.indexPending()).resolves.toBe(1);

    expect(aiClientService.embedBatch).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.emailMessage.updateMany).toHaveBeenCalled();
  });

  it('splits more than 100 chunks into several embedding calls', async () => {
    const { service, prisma, aiClientService } = build({
      SEARCH_INDEX_BATCH_SIZE: '150',
    });
    prisma.emailMessage.findMany.mockResolvedValue(
      Array.from({ length: 150 }, (_, i) => message(`m${i}`, `Body ${i}`)),
    );

    await service.indexPending();

    const sizes = aiClientService.embedBatch.mock.calls.map(
      ([texts]) => texts.length,
    );
    expect(sizes).toEqual([100, 50]);
  });

  it('writes nothing when the AI service returns the wrong number of embeddings', async () => {
    const { service, prisma, aiClientService } = build();
    prisma.emailMessage.findMany.mockResolvedValue([
      message('m1', 'One'),
      message('m2', 'Two'),
    ]);
    aiClientService.embedBatch.mockResolvedValue({
      embeddings: [[0.1]],
      provider: 'google',
      model: 'gemini-embedding-001',
    });

    await expect(service.indexPending()).rejects.toThrow(
      'returned 1 embeddings for 2 texts',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("counts progress only over the user's own accounts", async () => {
    const { service, prisma } = build();
    prisma.emailMessage.count
      .mockResolvedValueOnce(40)
      .mockResolvedValueOnce(100);

    await expect(service.getProgress('user-1')).resolves.toEqual({
      indexed: 40,
      total: 100,
    });

    const [[args]] = prisma.emailMessage.count.mock.calls as [
      [{ where: { thread: { account: unknown } } }],
    ];
    expect(args.where.thread.account).toEqual({
      deletedAt: null,
      members: { some: { userId: 'user-1' } },
    });
  });
});
