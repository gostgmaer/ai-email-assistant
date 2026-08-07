import { NotFoundException } from '@nestjs/common';

import type { EmailAccountService } from '../../email-account/services/email-account.service';
import { AgentService } from './agent.service';

describe('AgentService', () => {
  const userId = 'user-1';
  const accountId = 'account-1';

  function buildDeps() {
    const prisma = {
      agent: {
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const emailAccountService = {
      getOwnedAccountOrThrow: jest.fn().mockResolvedValue({ id: accountId }),
    } as unknown as jest.Mocked<EmailAccountService>;

    const service = new AgentService(prisma as never, emailAccountService);

    return { service, prisma, emailAccountService };
  }

  describe('create/update/delete', () => {
    it('requires ownership before creating', async () => {
      const { service, prisma, emailAccountService } = buildDeps();
      prisma.agent.create.mockResolvedValue({ id: 'agent-1' });

      await service.create(userId, accountId, {
        name: 'Support Bot',
        systemPrompt: 'Reply warmly and concisely.',
      });

      /* eslint-disable-next-line @typescript-eslint/unbound-method -- jest.fn() mock, never called unbound */
      expect(emailAccountService.getOwnedAccountOrThrow).toHaveBeenCalledWith(
        userId,
        accountId,
      );
      expect(prisma.agent.create).toHaveBeenCalledWith({
        data: {
          accountId,
          name: 'Support Bot',
          systemPrompt: 'Reply warmly and concisely.',
          enabled: true,
        },
      });
    });

    it('throws NotFoundException when updating an agent that does not belong to the account', async () => {
      const { service, prisma } = buildDeps();
      prisma.agent.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update(userId, accountId, 'agent-x', { name: 'New name' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('scopes delete by { id, accountId } so it never affects another account', async () => {
      const { service, prisma } = buildDeps();

      await service.delete(userId, accountId, 'agent-1');

      expect(prisma.agent.deleteMany).toHaveBeenCalledWith({
        where: { id: 'agent-1', accountId },
      });
    });
  });

  describe('getEnabledSystemPrompt', () => {
    it('returns the prompt when the agent belongs to the account and is enabled', async () => {
      const { service, prisma } = buildDeps();
      prisma.agent.findUnique.mockResolvedValue({
        id: 'agent-1',
        accountId,
        enabled: true,
        systemPrompt: 'Be concise.',
      });

      const result = await service.getEnabledSystemPrompt(accountId, 'agent-1');

      expect(result).toBe('Be concise.');
    });

    it('returns null when the agent belongs to a different account', async () => {
      const { service, prisma } = buildDeps();
      prisma.agent.findUnique.mockResolvedValue({
        id: 'agent-1',
        accountId: 'some-other-account',
        enabled: true,
        systemPrompt: 'Be concise.',
      });

      const result = await service.getEnabledSystemPrompt(accountId, 'agent-1');

      expect(result).toBeNull();
    });

    it('returns null when the agent is disabled', async () => {
      const { service, prisma } = buildDeps();
      prisma.agent.findUnique.mockResolvedValue({
        id: 'agent-1',
        accountId,
        enabled: false,
        systemPrompt: 'Be concise.',
      });

      const result = await service.getEnabledSystemPrompt(accountId, 'agent-1');

      expect(result).toBeNull();
    });

    it('returns null when the agent does not exist', async () => {
      const { service, prisma } = buildDeps();
      prisma.agent.findUnique.mockResolvedValue(null);

      const result = await service.getEnabledSystemPrompt(accountId, 'missing');

      expect(result).toBeNull();
    });
  });
});
