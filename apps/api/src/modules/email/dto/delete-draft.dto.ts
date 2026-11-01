import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

const DISCARD_REASONS = [
  'WRONG_FACTS',
  'WRONG_TONE',
  'SHOULD_NOT_REPLY',
  'TOO_LONG',
  'OTHER',
] as const;

export class DeleteDraftQueryDto {
  @ApiPropertyOptional({
    description: 'Why an AI draft was discarded',
    enum: DISCARD_REASONS,
  })
  @IsOptional()
  @IsIn(DISCARD_REASONS)
  reason?: (typeof DISCARD_REASONS)[number];
}
