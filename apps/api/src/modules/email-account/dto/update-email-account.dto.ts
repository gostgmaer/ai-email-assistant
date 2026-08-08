import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateEmailAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  syncEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Automatically schedule MEETING_REQUEST tasks extracted from this account (AI-suggested time, event created, confirmation reply sent) with no human review. Off by default.',
  })
  @IsOptional()
  @IsBoolean()
  autoScheduleMeetings?: boolean;

  @ApiPropertyOptional({
    description: 'Exclude marketing/promotional mail from sync (default true).',
  })
  @IsOptional()
  @IsBoolean()
  filterMarketing?: boolean;

  @ApiPropertyOptional({
    description: 'Exclude OTP/verification-code mail from sync (default true).',
  })
  @IsOptional()
  @IsBoolean()
  filterOtp?: boolean;

  @ApiPropertyOptional({
    description: 'Exclude password-reset mail from sync (default true).',
  })
  @IsOptional()
  @IsBoolean()
  filterPasswordReset?: boolean;

  @ApiPropertyOptional({
    description:
      'Exclude billing/invoice/receipt/statement mail from sync (default true).',
  })
  @IsOptional()
  @IsBoolean()
  filterBilling?: boolean;

  @ApiPropertyOptional({
    description:
      'Exclude shipping/order-tracking mail from sync (default true).',
  })
  @IsOptional()
  @IsBoolean()
  filterShipping?: boolean;

  @ApiPropertyOptional({
    description: 'Exclude calendar-invite mail from sync (default true).',
  })
  @IsOptional()
  @IsBoolean()
  filterCalendar?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Case-insensitive phrases that block an AI reply from auto-sending if present (e.g. "refund", "guarantee") — held for review instead. Empty by default; this account defines its own policy, nothing is pre-populated.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  prohibitedPhrases?: string[];
}
