import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

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
}
