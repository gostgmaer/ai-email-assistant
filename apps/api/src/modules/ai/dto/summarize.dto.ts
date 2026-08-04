import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SummarizeDto {
  @ApiProperty({ description: 'Email or thread text to summarize' })
  @IsString()
  @MinLength(1)
  text!: string;
}
