import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AskDto } from '../dto/ask.dto';
import { AskService } from '../services/ask.service';
import { EmailIndexService } from '../services/email-index.service';

@ApiTags('ask')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Controller('ask')
export class AskController {
  constructor(
    private readonly askService: AskService,
    private readonly emailIndexService: EmailIndexService,
  ) {}

  @Post()
  // Every question is an embedding call plus an LLM call.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Answer a question from your email, citing the emails used',
  })
  @ApiResponse({ status: 201, description: 'The answer and its sources' })
  @ApiResponse({
    status: 429,
    description: 'Too many questions, or the AI provider is rate-limiting',
  })
  async ask(@CurrentUser() user: JwtPayload, @Body() dto: AskDto) {
    return this.askService.ask(user.sub, dto.question, {
      accountId: dto.accountId,
      after: dto.after ? new Date(dto.after) : undefined,
      before: dto.before ? new Date(dto.before) : undefined,
    });
  }

  @Get('status')
  @ApiOperation({
    summary: 'How much of your mail is searchable yet (indexed / total)',
  })
  @ApiResponse({ status: 200, description: '{ indexed, total }' })
  async status(@CurrentUser() user: JwtPayload) {
    return this.emailIndexService.getProgress(user.sub);
  }
}
