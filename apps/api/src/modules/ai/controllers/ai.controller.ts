import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth';
import {
  ClassifyDto,
  GenerateReplyDto,
  RewriteDto,
  SummarizeDto,
} from '../dto';
import { AiClientService } from '../services/ai-client.service';

@ApiTags('ai')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiClientService: AiClientService) {}

  @Post('summarize')
  @ApiOperation({ summary: 'Summarize an email or thread' })
  @ApiResponse({ status: 200, description: 'The generated summary' })
  @ApiResponse({
    status: 502,
    description: 'The AI service failed or is unreachable',
  })
  async summarize(@Body() dto: SummarizeDto) {
    return this.aiClientService.summarize(dto.text);
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
  async reply(@Body() dto: GenerateReplyDto) {
    return this.aiClientService.generateReply(
      dto.threadContext,
      dto.instructions,
    );
  }

  @Post('rewrite')
  @ApiOperation({ summary: 'Rewrite draft text (tone, clarity, etc.)' })
  @ApiResponse({ status: 200, description: 'The rewritten text' })
  @ApiResponse({
    status: 502,
    description: 'The AI service failed or is unreachable',
  })
  async rewrite(@Body() dto: RewriteDto) {
    return this.aiClientService.rewrite(dto.text, dto.instructions);
  }

  @Post('classify')
  @ApiOperation({ summary: 'Classify an email into a category' })
  @ApiResponse({ status: 200, description: 'The classification result' })
  @ApiResponse({
    status: 502,
    description: 'The AI service failed or is unreachable',
  })
  async classify(@Body() dto: ClassifyDto) {
    return this.aiClientService.classify(dto.text);
  }
}
