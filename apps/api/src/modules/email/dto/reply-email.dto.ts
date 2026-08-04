import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

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
}
