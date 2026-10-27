import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';

import { UnsubscribeService } from './unsubscribe.service';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));

describe('UnsubscribeService', () => {
  const lookupMock = lookup as unknown as jest.Mock;
  let fetchMock: jest.SpyInstance;

  function build(
    message: {
      listUnsubscribe: string;
      listUnsubscribePost: string | null;
    } | null = {
      listUnsubscribe: '<https://list.example.com/u/abc>',
      listUnsubscribePost: 'List-Unsubscribe=One-Click',
    },
    threadFound = true,
  ) {
    const prisma = {
      emailThread: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            threadFound ? { messages: message ? [message] : [] } : null,
          ),
      },
    };
    return { service: new UnsubscribeService(prisma as never), prisma };
  }

  beforeEach(() => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => fetchMock.mockRestore());

  it("scopes the lookup to the user's own accounts", async () => {
    const { service, prisma } = build();

    await service.getOptions('user-1', 'thread-1');

    expect(prisma.emailThread.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'thread-1',
          account: { members: { some: { userId: 'user-1' } } },
        },
      }),
    );
  });

  it('sends the RFC 8058 POST without following redirects', async () => {
    const { service } = build();

    await service.unsubscribeOneClick('user-1', 'thread-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://list.example.com/u/abc',
      expect.objectContaining({
        method: 'POST',
        body: 'List-Unsubscribe=One-Click',
        redirect: 'manual',
      }),
    );
  });

  it('refuses when the sender has no one-click support', async () => {
    const { service } = build({
      listUnsubscribe: '<https://list.example.com/u/abc>',
      listUnsubscribePost: null,
    });

    await expect(
      service.unsubscribeOneClick('user-1', 'thread-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never calls a host that resolves to a private address', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]);
    const { service } = build();

    await expect(
      service.unsubscribeOneClick('user-1', 'thread-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a refusing or unreachable sender as 502', async () => {
    const { service } = build();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(
      service.unsubscribeOneClick('user-1', 'thread-1'),
    ).rejects.toBeInstanceOf(BadGatewayException);

    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(
      service.unsubscribeOneClick('user-1', 'thread-1'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it("404s another user's thread", async () => {
    const { service } = build(null, false);

    await expect(service.getOptions('user-1', 'thread-1')).rejects.toThrow(
      'Thread not found',
    );
  });
});
