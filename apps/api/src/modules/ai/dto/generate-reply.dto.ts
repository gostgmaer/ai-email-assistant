import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class GenerateReplyDto {
  @ApiProperty({ description: 'The thread/message content to reply to' })
  @IsString()
  @MinLength(1)
  threadContext!: string;

  @ApiPropertyOptional({
    description: 'Extra instructions, e.g. tone or key points',
  })
  @IsOptional()
  @IsString()
  instructions?: string;
}
