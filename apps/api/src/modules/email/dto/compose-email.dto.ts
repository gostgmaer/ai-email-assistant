import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { AttachmentInputDto } from './attachment-input.dto';

export class RecipientDto {
  @ApiProperty()
  @IsEmail()
  address!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class ComposeEmailDto {
  @ApiProperty({ description: 'The connected account to send from' })
  @IsUUID()
  accountId!: string;

  @ApiProperty({ type: [RecipientDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  to!: RecipientDto[];

  @ApiPropertyOptional({ type: [RecipientDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  cc?: RecipientDto[];

  @ApiPropertyOptional({ type: [RecipientDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  bcc?: RecipientDto[];

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  subject!: string;

  @ApiProperty({ description: 'HTML body' })
  @IsString()
  bodyHtml!: string;

  @ApiPropertyOptional({ description: 'Plain-text fallback body' })
  @IsOptional()
  @IsString()
  bodyText?: string;

  @ApiPropertyOptional({
    type: [AttachmentInputDto],
    description: 'Files to attach (base64), at most 3 MB in total',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AttachmentInputDto)
  attachments?: AttachmentInputDto[];

  @ApiPropertyOptional({
    description:
      'Remind me (a follow-up task + notification) if nobody replies within this many days',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  remindIfNoReplyDays?: number;
}
