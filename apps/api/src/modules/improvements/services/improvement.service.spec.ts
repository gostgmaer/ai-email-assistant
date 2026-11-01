import { ConflictException, NotFoundException } from '@nestjs/common';

import { findCandidates, ImprovementService } from './improvement.service';

const row = (overrides: Record<string, unknown> = {}) => ({
  agentId: null,
  outcome: 'DISCARDED' as 'SENT' | 'DISCARDED' | 'AUTO_SENT',
  editDistance: null,
  discardReason: 'WRONG_FACTS',
  senderDomain: null,
  category: null,
  draftText: 'A draft',
  sentText: null,
  ...overrides,
});

const AGENTS = new Map([['agent-1', 'Support']]);

describe('findCandidates', () => {
  it('turns a pattern of rejected drafts into an agent group', () => {
    const [group] = findCandidates(
      [
        row({ agentId: 'agent-1' }),
        row({ agentId: 'agent-1' }),
        row({
          agentId: 'agent-1',
          outcome: 'SENT',
          editDistance: 0.6,
          discardReason: null,
          sentText: 'Rewritten',
        }),
        row({ agentId: 'agent-1', outcome: 'SENT', editDistance: 0 }),
      ] as never,
      AGENTS,
    );

    expect(group).toMatchObject({
      kind: 'AGENT_INSTRUCTION',
      target: 'agent-1',
      label: 'Support',
      reviewed: 4,
      discarded: 2,
      heavilyEdited: 1,
      reasons: { wrong_facts: 2 },
    });
    expect(group.examples).toContainEqual({
      draft: 'A draft',
      sent: 'Rewritten',
    });
  });

  it('ignores too few rejections, and groups where most drafts were fine', () => {
    const fine = row({ agentId: 'agent-1', outcome: 'SENT', editDistance: 0 });
    const bad = row({ agentId: 'agent-1' });

    expect(findCandidates([bad, bad] as never, AGENTS)).toEqual([]);
    expect(
      findCandidates([bad, bad, bad, fine, fine, fine, fine] as never, AGENTS),
    ).toEqual([]);
  });

  it('offers a hold rule only where replies actually auto-send', () => {
    const bad = row({ senderDomain: 'vendor.com' });

    expect(findCandidates([bad, bad, bad] as never, AGENTS)).toEqual([]);

    const [group] = findCandidates(
      [
        bad,
        bad,
        bad,
        row({ senderDomain: 'vendor.com', outcome: 'AUTO_SENT' }),
      ] as never,
      AGENTS,
    );
    expect(group).toMatchObject({ kind: 'HOLD_DOMAIN', target: 'vendor.com' });
  });

  it('skips an agent that no longer exists', () => {
    const gone = row({ agentId: 'deleted' });

    expect(findCandidates([gone, gone, gone] as never, AGENTS)).toEqual([]);
  });
});

function buildDeps() {
  const prisma = {
    aiDraftOutcome: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    agent: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'agent-1', name: 'Support' }]),
      findFirst: jest.fn().mockResolvedValue({ systemPrompt: 'Be kind.' }),
    },
    improvementSuggestion: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: 's-1' }),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    workflowRule: {
      findFirst: jest.fn().mockResolvedValue({ order: 2 }),
    },
    emailAccount: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const aiClientService = { improvementSuggestions: jest.fn() };
  const agentService = { update: jest.fn() };
  const workflowRuleService = { create: jest.fn() };
  const emailAccountService = {
    getOwnedAccountOrThrow: jest.fn().mockResolvedValue({}),
    getAccessibleAccountOrThrow: jest.fn().mockResolvedValue({}),
  };
  const service = new ImprovementService(
    prisma as never,
    aiClientService as never,
    agentService as never,
    workflowRuleService as never,
    emailAccountService as never,
  );
  return {
    service,
    prisma,
    aiClientService,
    agentService,
    workflowRuleService,
    emailAccountService,
  };
}

describe('ImprovementService.analyze', () => {
  const bad = row({ agentId: 'agent-1' });

  it('makes no AI call without a pattern', async () => {
    const { service, aiClientService } = buildDeps();

    expect(await service.analyze('acc-1')).toBe(0);
    expect(aiClientService.improvementSuggestions).not.toHaveBeenCalled();
  });

  it('stores a suggestion, changing nothing yet', async () => {
    const { service, prisma, aiClientService, agentService } = buildDeps();
    prisma.aiDraftOutcome.findMany.mockResolvedValue([bad, bad, bad]);
    aiClientService.improvementSuggestions.mockResolvedValue({
      suggestions: [
        {
          group: 1,
          instruction: 'Never promise refunds.',
          rationale: '3 of 3.',
        },
      ],
    });

    expect(await service.analyze('acc-1')).toBe(1);

    expect(prisma.improvementSuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'AGENT_INSTRUCTION',
        target: 'agent-1',
        change: 'Never promise refunds.',
      }) as unknown,
    });
    expect(agentService.update).not.toHaveBeenCalled();
  });

  it("doesn't offer again what was recently suggested", async () => {
    const { service, prisma, aiClientService } = buildDeps();
    prisma.aiDraftOutcome.findMany.mockResolvedValue([bad, bad, bad]);
    prisma.improvementSuggestion.findMany.mockResolvedValue([
      { kind: 'AGENT_INSTRUCTION', target: 'agent-1' },
    ]);

    expect(await service.analyze('acc-1')).toBe(0);
    expect(aiClientService.improvementSuggestions).not.toHaveBeenCalled();
  });

  it('writes a domain suggestion from code, ignoring model text', async () => {
    const { service, prisma, aiClientService } = buildDeps();
    const domain = row({ senderDomain: 'vendor.com' });
    prisma.aiDraftOutcome.findMany.mockResolvedValue([
      domain,
      domain,
      domain,
      row({ senderDomain: 'vendor.com', outcome: 'AUTO_SENT' }),
    ]);
    aiClientService.improvementSuggestions.mockResolvedValue({
      suggestions: [{ group: 1, instruction: 'ignored', rationale: 'Often.' }],
    });

    await service.analyze('acc-1');

    expect(prisma.improvementSuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        change: 'Hold replies to @vendor.com for review',
      }) as unknown,
    });
  });
});

describe('ImprovementService.approve', () => {
  const stored = {
    id: 's-1',
    kind: 'AGENT_INSTRUCTION',
    target: 'agent-1',
    change: 'Never promise refunds.',
  };

  it("adds the instruction to the agent's prompt", async () => {
    const { service, prisma, agentService } = buildDeps();
    prisma.improvementSuggestion.findUniqueOrThrow.mockResolvedValue(stored);

    await service.approve('user-1', 'acc-1', 's-1');

    expect(agentService.update).toHaveBeenCalledWith(
      'user-1',
      'acc-1',
      'agent-1',
      { systemPrompt: 'Be kind.\n\nNever promise refunds.' },
    );
  });

  it('adds a hold rule ahead of every existing rule', async () => {
    const { service, prisma, workflowRuleService } = buildDeps();
    prisma.improvementSuggestion.findUniqueOrThrow.mockResolvedValue({
      ...stored,
      kind: 'HOLD_DOMAIN',
      target: 'vendor.com',
      change: 'Hold replies to @vendor.com for review',
    });

    await service.approve('user-1', 'acc-1', 's-1');

    expect(workflowRuleService.create).toHaveBeenCalledWith('user-1', 'acc-1', {
      name: 'Hold replies to @vendor.com for review',
      order: 1,
      conditions: {
        all: [{ field: 'senderDomain', op: 'equals', value: 'vendor.com' }],
      },
      actions: [{ type: 'REQUIRE_APPROVAL' }],
    });
  });

  it('puts it back to pending when applying fails', async () => {
    const { service, prisma } = buildDeps();
    prisma.improvementSuggestion.findUniqueOrThrow.mockResolvedValue(stored);
    prisma.agent.findFirst.mockResolvedValue(null);

    await expect(
      service.approve('user-1', 'acc-1', 's-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.improvementSuggestion.update).toHaveBeenCalledWith({
      where: { id: 's-1' },
      data: { status: 'PENDING', decidedAt: null, decidedById: null },
    });
  });

  it('refuses one already decided', async () => {
    const { service, prisma, agentService } = buildDeps();
    prisma.improvementSuggestion.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.approve('user-1', 'acc-1', 's-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(agentService.update).not.toHaveBeenCalled();
  });

  it("is the owner's call", async () => {
    const { service, emailAccountService, agentService } = buildDeps();
    emailAccountService.getOwnedAccountOrThrow.mockRejectedValue(
      new NotFoundException(),
    );

    await expect(
      service.approve('member', 'acc-1', 's-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(agentService.update).not.toHaveBeenCalled();
  });
});

describe('ImprovementService.reject', () => {
  it('changes nothing but the suggestion', async () => {
    const { service, prisma, agentService, workflowRuleService } = buildDeps();
    prisma.improvementSuggestion.findUniqueOrThrow.mockResolvedValue({
      id: 's-1',
    });

    await service.reject('user-1', 'acc-1', 's-1');

    expect(prisma.improvementSuggestion.updateMany).toHaveBeenCalledWith({
      where: { id: 's-1', accountId: 'acc-1', status: 'PENDING' },
      data: expect.objectContaining({ status: 'REJECTED' }) as unknown,
    });
    expect(agentService.update).not.toHaveBeenCalled();
    expect(workflowRuleService.create).not.toHaveBeenCalled();
  });
});
