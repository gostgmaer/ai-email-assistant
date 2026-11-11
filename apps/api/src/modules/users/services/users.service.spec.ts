import { BadRequestException } from '@nestjs/common';

import { UsersService } from './users.service';

describe('UsersService.updateProfile', () => {
  function build() {
    const prisma = { user: { update: jest.fn().mockResolvedValue({}) } };
    const service = new UsersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma };
  }

  it('stores cleared text fields as unset, not as empty strings', async () => {
    const { service, prisma } = build();

    await service.updateProfile('user-1', {
      displayName: ' Kishor ',
      jobTitle: '',
      companyName: '   ',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        displayName: 'Kishor',
        jobTitle: null,
        companyName: null,
      }) as unknown,
    });
  });

  it('leaves fields that were not sent unchanged', async () => {
    const { service, prisma } = build();

    await service.updateProfile('user-1', { timezone: 'Asia/Kolkata' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        jobTitle: undefined,
        companyName: undefined,
        timezone: 'Asia/Kolkata',
      }) as unknown,
    });
  });

  it('rejects an unknown timezone', async () => {
    const { service } = build();

    await expect(
      service.updateProfile('user-1', { timezone: 'Mars/Base' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('UsersService.softDelete', () => {
  function build(options: { failDisconnect?: boolean } = {}) {
    const calls: string[] = [];
    const prisma = {
      emailAccount: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'mine-1' }, { id: 'mine-2' }]),
      },
      accountMember: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { accountId: 'theirs-1', account: { userId: 'owner-9' } },
          ]),
      },
      calendarAccount: {
        findMany: jest.fn().mockResolvedValue([{ id: 'cal-1' }]),
      },
      user: { update: jest.fn(() => (calls.push('user.update'), {})) },
      refreshToken: {
        updateMany: jest.fn(() => (calls.push('revokeSessions'), {})),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    const emailAccountService = {
      disconnect: jest.fn((_userId: string, accountId: string) => {
        calls.push(`disconnect:${accountId}`);
        return options.failDisconnect
          ? Promise.reject(new Error('provider down'))
          : Promise.resolve();
      }),
      removeMember: jest.fn((_owner: string, accountId: string) => {
        calls.push(`leave:${accountId}`);
        return Promise.resolve();
      }),
    };
    const calendarAccountService = {
      disconnect: jest.fn((_userId: string, accountId: string) => {
        calls.push(`calendar:${accountId}`);
        return Promise.resolve();
      }),
    };
    const service = new UsersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      emailAccountService as never,
      calendarAccountService as never,
    );
    return {
      service,
      prisma,
      emailAccountService,
      calendarAccountService,
      calls,
    };
  }

  it('disconnects owned mailboxes and calendars, leaves shared mailboxes, then deletes the user and signs out every session', async () => {
    const {
      service,
      prisma,
      emailAccountService,
      calendarAccountService,
      calls,
    } = build();

    await service.softDelete('user-1');

    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', deletedAt: null } }),
    );
    expect(emailAccountService.disconnect).toHaveBeenCalledWith(
      'user-1',
      'mine-1',
    );
    expect(emailAccountService.disconnect).toHaveBeenCalledWith(
      'user-1',
      'mine-2',
    );
    expect(emailAccountService.removeMember).toHaveBeenCalledWith(
      'owner-9',
      'theirs-1',
      'user-1',
    );
    expect(calendarAccountService.disconnect).toHaveBeenCalledWith(
      'user-1',
      'cal-1',
    );
    // The user is only marked deleted once everything else is done.
    expect(calls.slice(-2).sort()).toEqual(['revokeSessions', 'user.update']);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('leaves the user undeleted if a disconnect fails, so deleting again can finish the job', async () => {
    const { service, prisma } = build({ failDisconnect: true });

    await expect(service.softDelete('user-1')).rejects.toThrow('provider down');

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
