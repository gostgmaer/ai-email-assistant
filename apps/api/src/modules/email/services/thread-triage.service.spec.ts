import { ThreadTriageService } from './thread-triage.service';

describe('ThreadTriageService', () => {
  function build(latest: Record<string, unknown> | undefined) {
    const prisma = {
      emailThread: {
        findUnique: jest.fn().mockResolvedValue({
          account: { email: 'me@work.io', aliases: [] },
          messages: latest ? [latest] : [],
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };
    return { service: new ThreadTriageService(prisma as never), prisma };
  }

  it("stores the newest message's triage on the thread", async () => {
    const { service, prisma } = build({
      from: [{ address: 'sam@client.io' }],
      to: [{ address: 'me@work.io' }],
      needsReply: true,
    });

    await service.refresh('thread-1');

    expect(prisma.emailThread.update).toHaveBeenCalledWith({
      where: { id: 'thread-1' },
      data: { triage: 'NEEDS_REPLY' },
    });
  });

  it('leaves a thread without messages alone', async () => {
    const { service, prisma } = build(undefined);

    await service.refresh('thread-1');

    expect(prisma.emailThread.update).not.toHaveBeenCalled();
  });

  it('never throws from refreshQuietly', async () => {
    const { service, prisma } = build(undefined);
    prisma.emailThread.findUnique.mockRejectedValue(new Error('db down'));

    await expect(service.refreshQuietly('thread-1')).resolves.toBeUndefined();
  });

  it('backfills untriaged, non-draft threads newest first', async () => {
    const { service, prisma } = build({
      from: [{ address: 'sam@client.io' }],
      to: [{ address: 'me@work.io' }],
    });
    prisma.emailThread.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

    await expect(service.backfill()).resolves.toBe(2);

    expect(prisma.emailThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          triage: null,
          folder: { type: { not: 'DRAFTS' } },
        }) as unknown,
        orderBy: { lastMessageAt: 'desc' },
      }),
    );
    expect(prisma.emailThread.update).toHaveBeenCalledTimes(2);
  });
});
