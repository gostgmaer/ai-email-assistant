import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

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

  @ApiPropertyOptional({
    description:
      'Per-account switch for autonomous sending. Off holds every reply a rule would auto-send as a draft.',
  })
  @IsOptional()
  @IsBoolean()
  autoSendEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Max auto-replies per rolling hour (default 10).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  autoSendHourlyCap?: number;

  @ApiPropertyOptional({
    description: 'Max auto-replies per rolling 24 hours (default 50).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  autoSendDailyCap?: number;

  @ApiPropertyOptional({
    description:
      'Minimum validation confidence (0-100) for a reply to auto-send (default 70).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  autoSendConfidenceThreshold?: number;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Quiet hours start, "HH:MM" in your timezone. Set both start and end, or both null for none.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(TIME_OF_DAY, { message: 'quietHoursStart must be HH:MM' })
  quietHoursStart?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Quiet hours end, "HH:MM".',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(TIME_OF_DAY, { message: 'quietHoursEnd must be HH:MM' })
  quietHoursEnd?: string | null;

  @ApiPropertyOptional({
    description:
      'Seconds an auto-reply waits (cancellable) before it sends, 0-300 (default 0).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300)
  undoSendSeconds?: number;

  @ApiPropertyOptional({ description: 'Business hours start, "HH:MM".' })
  @IsOptional()
  @Matches(TIME_OF_DAY, { message: 'businessHoursStart must be HH:MM' })
  businessHoursStart?: string;

  @ApiPropertyOptional({ description: 'Business hours end, "HH:MM".' })
  @IsOptional()
  @Matches(TIME_OF_DAY, { message: 'businessHoursEnd must be HH:MM' })
  businessHoursEnd?: string;

  @ApiPropertyOptional({
    type: [Number],
    description: 'Business days, 0 = Sunday ... 6 = Saturday.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  businessDays?: number[];

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Plain-text signature appended to AI-generated replies. Empty string = no signature.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  signatureText?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'HTML signature appended to AI-generated replies (used in the HTML part; signatureText in the text part).',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(10000)
  signatureHtml?: string | null;
}
