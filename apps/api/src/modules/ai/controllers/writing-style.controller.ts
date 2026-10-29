import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

// Leaf-file imports rather than the '../../auth' barrel — see the comment
// in documents.controller.ts for why.
import { PrismaService } from '../../../database';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { EmailAccountService } from '../../email-account/services/email-account.service';
import { UpdateWritingStyleDto } from '../dto';
import type { WritingStyle } from '../services/ai-client.service';
import {
  STYLE_MIN_SAMPLES,
  WritingStyleService,
} from '../services/writing-style.service';

@ApiTags('ai')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('email-accounts/:accountId/writing-style')
export class WritingStyleController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailAccountService: EmailAccountService,
    private readonly writingStyleService: WritingStyleService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      "How the account's owner writes, as learned from their sent mail ({ style: null } until built), with AI-draft edit stats before and after",
  })
  @ApiResponse({ status: 200, description: '{ style }, null until built' })
  async get(
    @CurrentUser() user: JwtPayload,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ) {
    await this.emailAccountService.getAccessibleAccountOrThrow(
      user.sub,
      accountId,
    );
    // Wrapped: a bare null would go out as an empty body.
    return { style: await this.view(accountId) };
  }

  @Patch()
  @ApiOperation({ summary: 'Edit the profile, or turn it on or off (owner)' })
  @ApiResponse({ status: 200, description: 'The updated profile' })
  @ApiResponse({ status: 404, description: 'No profile built yet' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() dto: UpdateWritingStyleDto,
  ) {
    await this.emailAccountService.getOwnedAccountOrThrow(user.sub, accountId);

    const existing = await this.prisma.writingStyleProfile.findUnique({
      where: { accountId },
    });
    if (!existing) {
      throw new NotFoundException(
        'No writing style yet. Build it from your sent mail first.',
      );
    }

    await this.prisma.writingStyleProfile.update({
      where: { accountId },
      data: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.profile
          ? {
              profile: {
                ...(existing.profile as unknown as WritingStyle),
                ...dto.profile,
              },
              editedAt: new Date(),
            }
          : {}),
      },
    });
    return this.view(accountId);
  }

  @Post('rebuild')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Learn the profile again from the latest sent mail now, replacing any edits (owner)',
  })
  @ApiResponse({ status: 200, description: 'The rebuilt profile' })
  @ApiResponse({ status: 400, description: 'Not enough sent mail yet' })
  async rebuild(
    @CurrentUser() user: JwtPayload,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ) {
    await this.emailAccountService.getOwnedAccountOrThrow(user.sub, accountId);

    const result = await this.writingStyleService.build(accountId);
    if (result.status === 'not-enough-mail') {
      throw new BadRequestException(
        `Only ${result.sampleCount} of your sent emails could be used; at least ${STYLE_MIN_SAMPLES} are needed.`,
      );
    }
    return this.view(accountId);
  }

  private async view(accountId: string) {
    const row = await this.prisma.writingStyleProfile.findUnique({
      where: { accountId },
    });
    if (!row) {
      return null;
    }
    return {
      profile: row.profile as unknown as WritingStyle,
      sampleCount: row.sampleCount,
      enabled: row.enabled,
      builtAt: row.builtAt,
      editedAt: row.editedAt,
      createdAt: row.createdAt,
      editStats: await this.writingStyleService.editStats(
        accountId,
        row.createdAt,
      ),
    };
  }
}
