import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { EmailAccountService } from '../../email-account/services/email-account.service';
import { InboxService } from '../../email/services/inbox.service';
import {
  ClassifyDto,
  GenerateReplyDto,
  RewriteDto,
  SummarizeDto,
} from '../dto';
import { AiClientService, WritingStyle } from '../services/ai-client.service';
import { WritingStyleService } from '../services/writing-style.service';
import { scanOutputForActionClaims } from '../utils/action-claim-scan.util';
import {
  buildThreadContext,
  toEmailMessageDto,
} from '../utils/thread-context.util';

@ApiTags('ai')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiClientService: AiClientService,
    private readonly inboxService: InboxService,
    private readonly emailAccountService: EmailAccountService,
    private readonly writingStyleService: WritingStyleService,
  ) {}

  @Post('summarize')
  @ApiOperation({ summary: 'Summarize an email or thread' })
  @ApiResponse({ status: 200, description: 'The generated summary' })
  @ApiResponse({
    status: 502,
    description: 'The AI service failed or is unreachable',
  })
  async summarize(@Body() dto: SummarizeDto) {
    return this.aiClientService.summarize(dto.subject, dto.thread);
  }

  @Post('threads/:threadId/summary')
  @ApiOperation({
    summary: 'Summarize a thread and save it, so the inbox list shows it too',
  })
  @ApiResponse({ status: 201, description: 'The saved summary' })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  @ApiResponse({
    status: 502,
    description: 'The AI service failed or is unreachable',
  })
  async summarizeThread(
    @CurrentUser() user: JwtPayload,
    @Param('threadId', ParseUUIDPipe) threadId: string,
  ) {
    // getThread checks the user can see this thread before any AI call.
    const thread = await this.inboxService.getThread(user.sub, threadId);
    const result = await this.aiClientService.summarize(
      thread.subject ?? '(no subject)',
      buildThreadContext(thread.messages.map(toEmailMessageDto)),
    );
    await this.inboxService.saveSummary(
      user.sub,
      threadId,
      result.summary,
      result.keyPoints,
    );
    return result;
  }

  @Post('reply')
  @ApiOperation({
    summary: 'Generate a suggested reply for approval before sending',
  })
  @ApiResponse({ status: 200, description: 'The generated reply draft' })
  @ApiResponse({
    status: 502,
    description: 'The AI service failed or is unreachable',
  })
  async reply(@CurrentUser() user: JwtPayload, @Body() dto: GenerateReplyDto) {
    const result = await this.aiClientService.generateReply(
      dto.subject,
      dto.thread,
      dto.instruction,
      undefined,
      undefined,
      await this.writingStyleFor(user.sub, dto.accountId),
    );
    // Same deterministic check the auto-send path runs: the user is about
    // to send this themselves, so flag "already done / attached" claims
    // for them to check rather than silently passing them through.
    const { claims } = scanOutputForActionClaims(result.reply);
    return { ...result, unsupportedClaims: claims };
  }

  @Post('rewrite')
  @ApiOperation({ summary: 'Rewrite draft text (tone, clarity, etc.)' })
  @ApiResponse({ status: 200, description: 'The rewritten text' })
  @ApiResponse({
    status: 502,
    description: 'The AI service failed or is unreachable',
  })
  async rewrite(@CurrentUser() user: JwtPayload, @Body() dto: RewriteDto) {
    return this.aiClientService.rewrite(
      dto.draft,
      dto.instruction,
      dto.style,
      await this.writingStyleFor(user.sub, dto.accountId),
    );
  }

  /** The account's writing style, when the caller names an account they
   * can use and it has one switched on. */
  private async writingStyleFor(
    userId: string,
    accountId?: string,
  ): Promise<WritingStyle | undefined> {
    if (!accountId) {
      return undefined;
    }
    await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      accountId,
    );
    return this.writingStyleService.forAccountQuietly(accountId);
  }

  @Post('classify')
  @ApiOperation({ summary: 'Classify an email into a category' })
  @ApiResponse({ status: 200, description: 'The classification result' })
  @ApiResponse({
    status: 502,
    description: 'The AI service failed or is unreachable',
  })
  async classify(@Body() dto: ClassifyDto) {
    return this.aiClientService.classify(dto.subject, dto.thread);
  }
}
