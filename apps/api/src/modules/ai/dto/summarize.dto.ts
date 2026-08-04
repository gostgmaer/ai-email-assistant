import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { EmailMessageDto } from './email-message.dto';

export class SummarizeDto {
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
}
