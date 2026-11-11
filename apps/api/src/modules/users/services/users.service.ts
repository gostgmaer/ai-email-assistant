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
import { isValidTimeZone } from '../../../common/utils/local-time.util';
import { PasswordService } from '../../auth/services/password.service';
import { VerificationTokenService } from '../../auth/services/verification-token.service';
import { CalendarAccountService } from '../../calendar/services/calendar-account.service';
import { EmailAccountService } from '../../email-account/services/email-account.service';
import { ChangeEmailDto, ChangePasswordDto, UpdateProfileDto } from '../dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly verificationTokenService: VerificationTokenService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
    private readonly emailAccountService: EmailAccountService,
    private readonly calendarAccountService: CalendarAccountService,
  ) {}

  async findById(id: string): Promise<UserModel> {
    return this.prisma.user.findUniqueOrThrow({ where: { id } });
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserModel> {
    if (dto.timezone !== undefined && !isValidTimeZone(dto.timezone)) {
      throw new BadRequestException(
        `Unknown timezone "${dto.timezone}" — use an IANA name like Europe/Berlin`,
      );
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        displayName: blankToNull(dto.displayName),
        avatar: dto.avatar,
        jobTitle: blankToNull(dto.jobTitle),
        companyName: blankToNull(dto.companyName),
        timezone: dto.timezone,
        digestHour: dto.digestHour,
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

  /**
   * Deleting an account must also stop everything acting on the user's
   * behalf — otherwise their mailboxes keep syncing with the stored
   * credentials, their rules (auto-replies included) keep running, and
   * their teammates keep access. Each step reuses the path the matching
   * Settings button takes, so the cleanup is identical to doing it by hand.
   * The user row is marked deleted last: if a step fails, the account still
   * exists and deleting again picks up where this left off (every step is
   * idempotent — a disconnected account is no longer listed).
   */
  async softDelete(id: string): Promise<void> {
    const [ownedMailboxes, sharedWithMe, calendars] = await Promise.all([
      this.prisma.emailAccount.findMany({
        where: { userId: id, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.accountMember.findMany({
        where: {
          userId: id,
          role: 'MEMBER',
          account: { deletedAt: null },
        },
        select: { accountId: true, account: { select: { userId: true } } },
      }),
      this.prisma.calendarAccount.findMany({
        where: { userId: id, deletedAt: null },
        select: { id: true },
      }),
    ]);

    for (const mailbox of ownedMailboxes) {
      await this.emailAccountService.disconnect(id, mailbox.id);
    }
    for (const membership of sharedWithMe) {
      await this.emailAccountService.removeMember(
        membership.account.userId,
        membership.accountId,
        id,
      );
    }
    for (const calendar of calendars) {
      await this.calendarAccountService.disconnect(id, calendar.id);
    }

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

/** A cleared text field means "not set": stored as null, not "" (forms
 * submit empty inputs as empty strings). Undefined = leave unchanged. */
function blankToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value.trim() === '' ? null : value.trim();
}
