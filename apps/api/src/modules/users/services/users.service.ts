import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../database';
import { UserModel } from '../../../generated/prisma/models';
import { UpdateProfileDto } from '../dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserModel> {
    return this.prisma.user.findUniqueOrThrow({ where: { id } });
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserModel> {
    return this.prisma.user.update({
      where: { id },
      data: {
        displayName: dto.displayName,
        avatar: dto.avatar,
      },
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}
