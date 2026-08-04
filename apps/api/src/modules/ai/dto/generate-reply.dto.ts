import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { EmailMessageDto } from './email-message.dto';

export class GenerateReplyDto {
  @ApiProperty({ description: 'Subject of the email thread' })
  @IsString()
  @MinLength(1)
  subject!: string;

  @ApiProperty({ type: [EmailMessageDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => EmailMessageDto)
  thread!: EmailMessageDto[];

  @ApiPropertyOptional({
    description: 'Extra instructions, e.g. tone or key points',
  })
  @IsOptional()
  @IsString()
  instruction?: string;
}
