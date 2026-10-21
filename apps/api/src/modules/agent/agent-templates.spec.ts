import { validateConditions } from '../workflow/utils/rule-conditions.util';
import { AGENT_TEMPLATES } from './agent-templates';
import { AgentService } from './services/agent.service';

describe('agent templates', () => {
  it('ships the five roadmap personas, plus the Personal Assistant', () => {
    expect(AGENT_TEMPLATES.map((t) => t.name)).toEqual([
      'Personal Assistant',
      'Customer Support Agent',
      'Sales Agent',
      'HR Agent',
      'Finance Agent',
      'Executive Assistant',
    ]);
  });

  it.each(AGENT_TEMPLATES.flatMap((t) => t.suggestedRules))(
    'suggested rule "$name" has valid conditions',
    (rule) => {
      expect(() => validateConditions(rule.conditions)).not.toThrow();
    },
  );

  it('creates the agent and its rules disabled, pointing the rules at the new agent', async () => {
    const tx = {
      agent: { create: jest.fn().mockResolvedValue({ id: 'agent-9' }) },
      workflowRule: {
        create: jest.fn((args: unknown) => Promise.resolve(args)),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const service = new AgentService(
      prisma as never,
      { getOwnedAccountOrThrow: jest.fn() } as never,
    );

    await service.createFromTemplate('user-1', 'account-1', 'sales');

    expect(tx.workflowRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        enabled: false,
        actions: [
          { type: 'AUTO_REPLY', agentId: 'agent-9' },
          { type: 'REQUIRE_APPROVAL' },
        ],
      }) as unknown,
    });
  });
});
