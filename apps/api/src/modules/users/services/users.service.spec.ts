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
