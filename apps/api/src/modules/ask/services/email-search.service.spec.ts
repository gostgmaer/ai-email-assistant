import { EmailSearchService } from './email-search.service';

describe('EmailSearchService', () => {
  function row(chunkId: string, threadId: string) {
    return {
      chunkId,
      messageId: `msg-${chunkId}`,
      threadId,
      subject: `Subject ${chunkId}`,
      from: [{ address: 'sam@client.io' }],
      receivedAt: new Date('2026-10-20T00:00:00Z'),
      content: `Content ${chunkId}`,
    };
  }

  function build({
    accounts = [{ id: 'account-1' }],
    vector = [] as ReturnType<typeof row>[],
    keyword = [] as ReturnType<typeof row>[],
  } = {}) {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce(vector)
      .mockResolvedValueOnce(keyword);
    const prisma = {
      emailAccount: { findMany: jest.fn().mockResolvedValue(accounts) },
      $queryRaw: queryRaw,
    };
    const aiClientService = {
      embedQuery: jest.fn().mockResolvedValue({ embedding: [0.1, 0.2] }),
    };
    const service = new EmailSearchService(
      prisma as never,
      aiClientService as never,
    );
    return { service, prisma, aiClientService, queryRaw };
  }

  it('searches only accounts the user is a member of', async () => {
    const { service, prisma } = build();

    await service.search('user-1', 'budget', { accountId: 'account-9' });

    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith({
      where: {
        id: 'account-9',
        deletedAt: null,
        members: { some: { userId: 'user-1' } },
      },
      select: { id: true },
    });
  });

  it('returns nothing, without embedding, when the user has no accounts', async () => {
    const { service, aiClientService, queryRaw } = build({ accounts: [] });

    await expect(service.search('user-1', 'budget')).resolves.toEqual([]);
    expect(aiClientService.embedQuery).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('puts a chunk found by both meaning and keyword first', async () => {
    const { service } = build({
      vector: [row('a', 't1'), row('b', 't2')],
      keyword: [row('b', 't2'), row('c', 't3')],
    });

    const hits = await service.search('user-1', 'budget');

    expect(hits.map((hit) => hit.chunkId)).toEqual(['b', 'a', 'c']);
    expect(hits[0]).toMatchObject({
      messageId: 'msg-b',
      threadId: 't2',
      content: 'Content b',
    });
  });

  it('takes at most two chunks from one thread', async () => {
    const { service } = build({
      vector: [row('a', 't1'), row('b', 't1'), row('c', 't1'), row('d', 't2')],
    });

    const hits = await service.search('user-1', 'budget');

    expect(hits.map((hit) => hit.chunkId)).toEqual(['a', 'b', 'd']);
  });

  it('stops at the result limit', async () => {
    const { service } = build({
      vector: Array.from({ length: 10 }, (_, i) => row(`c${i}`, `t${i}`)),
    });

    await expect(
      service.search('user-1', 'budget', {}, 3),
    ).resolves.toHaveLength(3);
  });

  it('skips the keyword search when the question has no searchable words', async () => {
    const { service, queryRaw } = build({ vector: [row('a', 't1')] });

    const hits = await service.search('user-1', 'what is this?');

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(hits).toHaveLength(1);
  });
});
