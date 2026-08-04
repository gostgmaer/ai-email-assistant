import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ClassifyDto {
  @ApiProperty({ description: 'Email text to classify' })
  @IsString()
  @MinLength(1)
  text!: string;
}
