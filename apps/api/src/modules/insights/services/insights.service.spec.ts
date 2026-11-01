import { ForbiddenException } from '@nestjs/common';

import {
  InsightsData,
  InsightsService,
  summarizeOutcomes,
  summarizeResponses,
  weekStart,
} from './insights.service';

const NOW = new Date('2026-11-04T12:00:00Z');
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe('summarizeResponses', () => {
  it('takes the median of answered threads in the window', () => {
    const summary = summarizeResponses(
      [
        { firstInboundAt: daysAgo(1), responseMs: 1000 },
        { firstInboundAt: daysAgo(2), responseMs: 3000 },
        { firstInboundAt: daysAgo(3), responseMs: null },
        // Outside the window.
        { firstInboundAt: daysAgo(9), responseMs: 999999 },
      ],
      daysAgo(7),
      NOW,
    );

    expect(summary).toEqual({ medianMs: 2000, answered: 2, unanswered: 1 });
  });

  it('has no median with nothing answered', () => {
    expect(summarizeResponses([], daysAgo(7), NOW).medianMs).toBeNull();
  });
});

describe('summarizeOutcomes', () => {
  it('counts each outcome and averages edits of sent drafts', () => {
    expect(
      summarizeOutcomes([
        { outcome: 'AUTO_SENT', editDistance: null },
        { outcome: 'SENT', editDistance: 0.2 },
        { outcome: 'SENT', editDistance: 0.4 },
        { outcome: 'DISCARDED', editDistance: null },
      ]),
    ).toEqual({
      autoSent: 1,
      heldThenSent: 2,
      heldThenDiscarded: 1,
      averageEditDistance: expect.closeTo(0.3) as unknown,
    });
  });
});

describe('weekStart', () => {
  it('is the Monday of that week', () => {
    expect(weekStart(new Date('2026-11-04T12:00:00Z'))).toBe('2026-11-02');
    expect(weekStart(new Date('2026-11-08T23:00:00Z'))).toBe('2026-11-02');
    expect(weekStart(new Date('2026-11-02T00:00:00Z'))).toBe('2026-11-02');
  });
});

function buildDeps() {
  const prisma = {
    emailAccount: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ email: 'me@x.com', aliases: ['Alias@x.com'] }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    threadMetrics: { findMany: jest.fn().mockResolvedValue([]) },
    aiDraftOutcome: { findMany: jest.fn().mockResolvedValue([]) },
    agent: { findMany: jest.fn().mockResolvedValue([]) },
    emailThread: { groupBy: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    insightsSnapshot: {
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn(),
      upsert: jest.fn(),
    },
    $executeRaw: jest.fn().mockResolvedValue(0),
  };
  const emailAccountService = {
    getAccessibleAccountOrThrow: jest.fn().mockResolvedValue({}),
  };
  const service = new InsightsService(
    prisma as never,
    emailAccountService as never,
  );
  return { service, prisma, emailAccountService };
}

const storedData = (prisma: ReturnType<typeof buildDeps>['prisma']) =>
  (
    prisma.insightsSnapshot.upsert.mock.calls[0] as [
      { create: { data: InsightsData } },
    ]
  )[0].create.data;

describe('InsightsService', () => {
  it('only reads the snapshot on page load', async () => {
    const { service, prisma } = buildDeps();

    expect(await service.get('user-1', 'acc-1')).toEqual({ insights: null });

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.aiDraftOutcome.findMany).not.toHaveBeenCalled();
  });

  it('is scoped to members of the account', async () => {
    const { service, prisma, emailAccountService } = buildDeps();
    emailAccountService.getAccessibleAccountOrThrow.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(service.get('stranger', 'acc-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.insightsSnapshot.findUnique).not.toHaveBeenCalled();
  });

  it('stores response times, AI outcomes and safety holds', async () => {
    const { service, prisma } = buildDeps();
    prisma.threadMetrics.findMany.mockResolvedValue([
      { firstInboundAt: daysAgo(1), responseMs: BigInt(60000) },
      { firstInboundAt: daysAgo(8), responseMs: null },
    ]);
    prisma.agent.findMany.mockResolvedValue([{ id: 'a-1', name: 'Support' }]);
    prisma.aiDraftOutcome.findMany.mockResolvedValue([
      {
        agentId: 'a-1',
        outcome: 'SENT',
        editDistance: 0.5,
        heldBy: ['VALIDATION'],
        createdAt: daysAgo(1),
      },
      {
        agentId: null,
        outcome: 'AUTO_SENT',
        editDistance: null,
        heldBy: [],
        createdAt: daysAgo(1),
      },
      {
        agentId: 'gone',
        outcome: 'DISCARDED',
        editDistance: null,
        heldBy: ['VALIDATION', 'URGENT'],
        createdAt: daysAgo(2),
      },
    ]);

    await service.refresh('acc-1', NOW);

    const data = storedData(prisma);
    expect(data.responseTimes.lastWeek).toEqual({
      medianMs: 60000,
      answered: 1,
      unanswered: 0,
    });
    expect(data.responseTimes.previousWeek.unanswered).toBe(1);
    expect(data.aiByAgent.map((row) => row.name).sort()).toEqual([
      'Default assistant',
      'Deleted agent',
      'Support',
    ]);
    expect(data.aiByWeek).toEqual([
      expect.objectContaining({
        weekStart: '2026-11-02',
        autoSent: 1,
        heldThenSent: 1,
        heldThenDiscarded: 1,
      }),
    ]);
    expect(data.safety).toEqual([
      { check: 'VALIDATION', count: 2 },
      { check: 'URGENT', count: 1 },
    ]);
  });

  it('groups open work per person', async () => {
    const { service, prisma } = buildDeps();
    prisma.emailThread.groupBy.mockResolvedValue([
      {
        assignedToUserId: 'u-1',
        triage: 'NEEDS_REPLY',
        lastMessageFromSelf: false,
        _count: { _all: 4 },
      },
      {
        assignedToUserId: 'u-1',
        triage: 'FYI',
        lastMessageFromSelf: true,
        _count: { _all: 2 },
      },
      {
        assignedToUserId: null,
        triage: 'NEEDS_REPLY',
        lastMessageFromSelf: false,
        _count: { _all: 1 },
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'u-1', displayName: 'Sam', email: 's@x.com' },
    ]);

    await service.refresh('acc-1', NOW);

    expect(storedData(prisma).workload).toEqual([
      { userId: 'u-1', name: 'Sam', openThreads: 4, waitingOnReply: 2 },
      { userId: null, name: 'Unassigned', openThreads: 1, waitingOnReply: 0 },
    ]);
  });

  it('one account failing does not stop the nightly run', async () => {
    const { service, prisma } = buildDeps();
    prisma.emailAccount.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    prisma.emailAccount.findUniqueOrThrow
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ email: 'me@x.com', aliases: [] });

    expect(await service.refreshAll(NOW)).toBe(1);
  });
});
