import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { AttachmentInputDto } from './attachment-input.dto';

export class ReplyEmailDto {
  @ApiProperty({
    description: 'The message being replied to (our internal id)',
  })
  @IsUUID()
  messageId!: string;

  @ApiProperty({ description: 'HTML body' })
  @IsString()
  bodyHtml!: string;

  @ApiPropertyOptional({ description: 'Plain-text fallback body' })
  @IsOptional()
  @IsString()
  bodyText?: string;

  @ApiPropertyOptional({
    description:
      'Also copy everyone else on the original message (its From/To/Cc, minus your own addresses)',
  })
  @IsOptional()
  @IsBoolean()
  replyAll?: boolean;

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
