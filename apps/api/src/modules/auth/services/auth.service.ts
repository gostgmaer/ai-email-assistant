import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../database';
import { MailerService } from '../../../infrastructure/mailer';
import { OAuthProfile } from '../../oauth/interfaces';
import { UserModel } from '../../../generated/prisma/models';
import { VerificationTokenType } from '../../../generated/prisma/enums';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { RegisterDto } from '../dto';
import { DeviceMetadata, TokenPair, TokenService } from './token.service';
import { PasswordService } from './password.service';
import { VerificationTokenService } from './verification-token.service';

export interface OAuthLoginResult {
  user: UserModel;
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly passwordService: PasswordService,
    private readonly verificationTokenService: VerificationTokenService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async loginWithOAuth(
    profile: OAuthProfile,
    device?: DeviceMetadata,
  ): Promise<OAuthLoginResult> {
    const user = await this.findOrCreateUser(profile);

    const payload: JwtPayload = { sub: user.id, email: user.email };
    const tokens = await this.tokenService.issueTokenPair(payload, device);

    return { user, tokens };
  }

  async register(
    dto: RegisterDto,
    device?: DeviceMetadata,
  ): Promise<OAuthLoginResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        displayName: dto.displayName,
        passwordHash,
      },
    });

    const payload: JwtPayload = { sub: user.id, email: user.email };
    const tokens = await this.tokenService.issueTokenPair(payload, device);

    await this.sendVerificationEmail(user.id, user.email);

    return { user, tokens };
  }

  async loginWithPassword(
    email: string,
    password: string,
    device?: DeviceMetadata,
  ): Promise<OAuthLoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user?.passwordHash || user.deletedAt) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const matches = await this.passwordService.compare(
      password,
      user.passwordHash,
    );

    if (!matches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = { sub: user.id, email: user.email };
    const tokens = await this.tokenService.issueTokenPair(payload, device);

    return { user, tokens };
  }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.verificationTokenService.consume(
      token,
      VerificationTokenType.EMAIL_VERIFICATION,
    );

    await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    });
  }

  async resendVerificationEmail(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (user.emailVerifiedAt) {
      return;
    }

    await this.sendVerificationEmail(user.id, user.email);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Don't reveal whether the email exists.
    if (!user || !user.passwordHash || user.deletedAt) {
      return;
    }

    const token = await this.verificationTokenService.issue(
      user.id,
      VerificationTokenType.PASSWORD_RESET,
    );

    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const link = new URL('/reset-password', frontendUrl);
    link.searchParams.set('token', token);

    await this.mailerService.sendPasswordResetEmail(
      user.email,
      link.toString(),
    );
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.verificationTokenService.consume(
      token,
      VerificationTokenType.PASSWORD_RESET,
    );

    const passwordHash = await this.passwordService.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async refresh(
    refreshToken: string,
    device?: DeviceMetadata,
  ): Promise<TokenPair> {
    return this.tokenService.rotateRefreshToken(refreshToken, device);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokenService.revokeRefreshToken(refreshToken);
  }

  private async sendVerificationEmail(
    userId: string,
    email: string,
  ): Promise<void> {
    const token = await this.verificationTokenService.issue(
      userId,
      VerificationTokenType.EMAIL_VERIFICATION,
    );

    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const link = new URL('/verify-email', frontendUrl);
    link.searchParams.set('token', token);

    await this.mailerService.sendVerificationEmail(email, link.toString());
  }

  private async findOrCreateUser(profile: OAuthProfile): Promise<UserModel> {
    const providerIdField =
      profile.provider === 'GOOGLE' ? 'googleId' : 'microsoftId';

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { [providerIdField]: profile.providerId },
          { email: profile.email },
        ],
      },
    });

    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          [providerIdField]: profile.providerId,
          displayName: existing.displayName ?? profile.displayName,
          avatar: existing.avatar ?? profile.avatar,
        },
      });
    }

    return this.prisma.user.create({
      data: {
        email: profile.email,
        displayName: profile.displayName,
        avatar: profile.avatar,
        [providerIdField]: profile.providerId,
      },
    });
  }
}
