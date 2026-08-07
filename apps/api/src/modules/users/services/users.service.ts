import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../database';
import { MailerService } from '../../../infrastructure/mailer';
import { UserModel } from '../../../generated/prisma/models';
import { VerificationTokenType } from '../../../generated/prisma/enums';
import { PasswordService } from '../../auth/services/password.service';
import { VerificationTokenService } from '../../auth/services/verification-token.service';
import { ChangeEmailDto, ChangePasswordDto, UpdateProfileDto } from '../dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly verificationTokenService: VerificationTokenService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

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

  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });

    if (user.passwordHash) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Current password is required');
      }

      const matches = await this.passwordService.compare(
        dto.currentPassword,
        user.passwordHash,
      );

      if (!matches) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    }

    const passwordHash = await this.passwordService.hash(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async requestEmailChange(id: string, dto: ChangeEmailDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });

    if (user.passwordHash) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Current password is required');
      }

      const matches = await this.passwordService.compare(
        dto.currentPassword,
        user.passwordHash,
      );

      if (!matches) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.newEmail },
    });

    if (existing) {
      throw new ConflictException('This email is already in use');
    }

    const token = await this.verificationTokenService.issue(
      id,
      VerificationTokenType.EMAIL_CHANGE,
      { newEmail: dto.newEmail },
    );

    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const link = new URL('/settings/profile', frontendUrl);
    link.searchParams.set('confirmEmailToken', token);

    await this.mailerService.sendEmailChangeConfirmation(
      dto.newEmail,
      link.toString(),
    );
  }

  async confirmEmailChange(id: string, token: string): Promise<UserModel> {
    const record = await this.verificationTokenService.consume(
      token,
      VerificationTokenType.EMAIL_CHANGE,
    );

    if (record.userId !== id || !record.newEmail) {
      throw new BadRequestException('Invalid or expired token');
    }

    return this.prisma.user.update({
      where: { id },
      data: { email: record.newEmail },
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
