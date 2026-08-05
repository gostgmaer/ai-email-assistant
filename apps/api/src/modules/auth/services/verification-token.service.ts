import { createHash, randomBytes } from 'crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../../database';
import { VerificationTokenModel } from '../../../generated/prisma/models';
import { VerificationTokenType } from '../../../generated/prisma/enums';

const TOKEN_TTL_MS: Record<VerificationTokenType, number> = {
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
  EMAIL_CHANGE: 60 * 60 * 1000,
};

@Injectable()
export class VerificationTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(
    userId: string,
    type: VerificationTokenType,
    options?: { newEmail?: string },
  ): Promise<string> {
    const token = randomBytes(32).toString('hex');

    await this.prisma.verificationToken.create({
      data: {
        userId,
        type,
        tokenHash: this.hashToken(token),
        newEmail: options?.newEmail,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS[type]),
      },
    });

    return token;
  }

  /** Validates and marks the token used; throws if invalid, wrong type, used, or expired. */
  async consume(
    token: string,
    type: VerificationTokenType,
  ): Promise<VerificationTokenModel> {
    const tokenHash = this.hashToken(token);

    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash },
    });

    if (
      !record ||
      record.type !== type ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    await this.prisma.verificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    return record;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
