import { PrismaService } from '../../../database';
import { ContactMemoryService } from './contact-memory.service';

describe('ContactMemoryService', () => {
  const userId = 'user-1';
  const otherUserId = 'user-2';

  function buildPrismaMock() {
    return {
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
  }

  it('always includes userId among the params of the upsertMemory query', async () => {
    const prisma = buildPrismaMock();
    const service = new ContactMemoryService(
      prisma as unknown as PrismaService,
    );

    await service.upsertMemory(
      userId,
      'sender@example.com',
      'Sender Name',
      { summary: 'hi', commitments: [] },
      [0.1, 0.2, 0.3],
    );

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    // args[0] is the TemplateStringsArray; interpolated values follow.
    const args = prisma.$executeRaw.mock.calls[0] as unknown[];
    expect(args.slice(1)).toContain(userId);
    expect(args.slice(1)).not.toContain(otherUserId);
  });

  it('always includes userId among the params of the searchSimilar query, scoping the WHERE clause', async () => {
    const prisma = buildPrismaMock();
    const service = new ContactMemoryService(
      prisma as unknown as PrismaService,
    );

    await service.searchSimilar(
      userId,
      [0.1, 0.2, 0.3],
      'current-sender@example.com',
      3,
    );

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const args = prisma.$queryRaw.mock.calls[0] as unknown[];
    expect(args.slice(1)).toContain(userId);
    expect(args.slice(1)).not.toContain(otherUserId);

    // The raw SQL text itself must filter by "userId" — not just pass it
    // as an unused parameter.
    const sqlText = (args[0] as TemplateStringsArray).join('?');
    expect(sqlText).toContain('"userId" =');
  });

  it('excludes the current sender and applies a distance threshold, so it never returns the caller their own just-upserted row or unrelated contacts', async () => {
    const prisma = buildPrismaMock();
    const service = new ContactMemoryService(
      prisma as unknown as PrismaService,
    );

    await service.searchSimilar(
      userId,
      [0.1, 0.2, 0.3],
      'current-sender@example.com',
      3,
    );

    const args = prisma.$queryRaw.mock.calls[0] as unknown[];
    expect(args.slice(1)).toContain('current-sender@example.com');
    // Default maxDistance.
    expect(args.slice(1)).toContain(0.5);

    const sqlText = (args[0] as TemplateStringsArray).join('?');
    expect(sqlText).toContain('"senderEmail" !=');
    expect(sqlText).toContain('<= ');
  });
});
