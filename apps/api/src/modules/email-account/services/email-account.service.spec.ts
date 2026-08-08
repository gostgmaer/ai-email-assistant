import type { ConfigService } from '@nestjs/config';

import { EmailAccountService } from './email-account.service';
import type { EncryptionService } from '../../../infrastructure/encryption';
import type { QueueService } from '../../../infrastructure/queue';
import type { MailConnectResult } from '../interfaces';

describe('EmailAccountService — default automation seeding', () => {
  function buildDeps() {
    const prisma = {
      emailAccount: {
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        upsert: jest.fn(),
      },
      emailCredential: { upsert: jest.fn() },
      accountMember: { upsert: jest.fn() },
      agent: { create: jest.fn() },
      workflowRule: { create: jest.fn() },
    };

    const encryptionService = {
      encrypt: jest.fn((v: string) => `enc(${v})`),
    } as unknown as EncryptionService;

    const configService = {} as ConfigService;

    const queueService = {
      enqueueInitialSync: jest.fn(),
    } as unknown as QueueService;

    const service = new EmailAccountService(
      prisma as never,
      encryptionService,
      configService,
      queueService,
    );

    return { service, prisma, queueService };
  }

  function buildConnectResult(
    overrides?: Partial<MailConnectResult>,
  ): MailConnectResult {
    return {
      userId: 'user-1',
      profile: { provider: 'GOOGLE', email: 'me@example.com' },
      tokens: { accessToken: 'token' },
      ...overrides,
    };
  }

  it('seeds a disabled starter Agent + WorkflowRule for a brand new account', async () => {
    const { service, prisma } = buildDeps();
    prisma.emailAccount.findUnique.mockResolvedValue(null);
    prisma.emailAccount.upsert.mockResolvedValue({ id: 'acct-1' });
    prisma.agent.create.mockResolvedValue({ id: 'agent-1' });

    await service.connectOAuthAccount(buildConnectResult());

    expect(prisma.agent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accountId: 'acct-1', enabled: true }),
      }),
    );
    expect(prisma.workflowRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'acct-1',
          enabled: false,
          conditions: [],
          actions: [{ type: 'AUTO_REPLY', agentId: 'agent-1' }],
        }),
      }),
    );
  });

  it('does not reseed when reconnecting an already-existing account', async () => {
    const { service, prisma } = buildDeps();
    prisma.emailAccount.findUnique.mockResolvedValue({
      id: 'acct-1',
      userId: 'user-1',
    });
    prisma.emailAccount.upsert.mockResolvedValue({ id: 'acct-1' });

    await service.connectOAuthAccount(buildConnectResult());

    expect(prisma.agent.create).not.toHaveBeenCalled();
    expect(prisma.workflowRule.create).not.toHaveBeenCalled();
  });
});
